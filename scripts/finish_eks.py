#!/usr/bin/env python3
"""Build and deploy an IP-restricted EKS candidate; never modify the EC2 source."""
import argparse
import datetime
import hashlib
import ipaddress
import json
import os
import re
from pathlib import Path
import secrets
import subprocess
import sys
import tarfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work" / "eks-finish"
ACCOUNT = "442767638448"
REGION = "us-east-1"
CLUSTER = "expense-tracker-eks"
REGISTRY = f"{ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com"
K = ["kubectl", "--context", CLUSTER, "-n", "default"]
DOCKER = ["sudo", "docker"]

# Only aggregate hashes leave PostgreSQL. No application records are printed.
SNAPSHOT_SQL = r"""
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SELECT 'column|' || table_name || '|' || ordinal_position || '|' || column_name || '|' ||
       udt_name || '|' || is_nullable || '|' || coalesce(column_default, '')
FROM information_schema.columns WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
SELECT 'constraint|' || c.relname || '|' || k.conname || '|' || pg_get_constraintdef(k.oid)
FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' ORDER BY c.relname, k.conname;
SELECT format($q$SELECT %L || '|' || count(*)::text || '|' ||
    coalesce(md5(string_agg(to_jsonb(t)::text, E'\n' ORDER BY to_jsonb(t)::text)), md5(''))
    FROM %I.%I AS t;$q$, 'table:' || tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
SELECT format($q$SELECT %L || '|' || last_value::text || '|' || is_called::text FROM %I.%I;$q$,
    'sequence:' || sequencename, schemaname, sequencename)
FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename
\gexec
COMMIT;
"""


def run(args, *, capture=False, payload=None, source=None, target=None):
    result = subprocess.run(
        [str(x) for x in args], cwd=ROOT, check=True,
        input=payload, stdin=source, stdout=target or (subprocess.PIPE if capture else None),
    )
    return result.stdout.decode().strip() if capture else None


def aws(*args):
    return json.loads(run(["aws", *args, "--region", REGION, "--output", "json"], capture=True))


def obj(*args):
    return json.loads(run([*K, *args, "-o", "json"], capture=True))


def apply(value):
    run([*K, "apply", "-f", "-"], payload=json.dumps(value).encode())


def marker(name):
    value = run([*K, "get", "configmap", name, "--ignore-not-found", "-o", "json"], capture=True)
    return json.loads(value)["data"] if value else None


def mark(name, data):
    apply({"apiVersion": "v1", "kind": "ConfigMap", "metadata": {"name": name}, "data": data})


def preflight():
    if aws("sts", "get-caller-identity")["Account"] != ACCOUNT:
        raise RuntimeError("Wrong AWS account")
    context = json.loads(run(["kubectl", "--context", CLUSTER, "config", "view", "--minify", "-o", "json"], capture=True))
    cluster = aws("eks", "describe-cluster", "--name", CLUSTER)["cluster"]
    if context["clusters"][0]["cluster"]["server"] != cluster["endpoint"]:
        raise RuntimeError("kubectl context does not match the AWS EKS endpoint")
    run([*K, "wait", "--for=condition=Ready", "nodes", "--all", "--timeout=180s"])
    run([*K, "get", "secret", "expense-tracker-secrets", "-o", "name"])
    run([*K, "rollout", "status", "statefulset/expense-tracker-database", "--timeout=300s"])
    run(["kubectl", "--context", CLUSTER, "-n", "kube-system", "rollout", "status",
         "deployment/aws-load-balancer-controller", "--timeout=180s"])


def build():
    run(["sudo", "-v"])
    tag = datetime.datetime.now(datetime.timezone.utc).strftime("eks-%Y%m%d%H%M%S-") + secrets.token_hex(3)
    for part in ("backend", "frontend"):
        run([*DOCKER, "build", "--pull", "-t", f"expense-tracker-{part}:{tag}", f"{part}/"])
    run([*DOCKER, "run", "--rm", "--entrypoint", "sh", f"expense-tracker-backend:{tag}",
         "-c", 'mkdir -p "$PROMETHEUS_MULTIPROC_DIR" && python -m unittest discover -s /app -p test_app.py -v'])
    raw = (ROOT / "kubernetes/frontend/nginx-configmap.yaml").read_text()
    config = "\n".join(x[4:] for x in raw.split("  default.conf: |\n", 1)[1].splitlines()) + "\n"
    nginx = WORK / "nginx.conf"
    nginx.write_text(config)
    run([*DOCKER, "run", "--rm", "--add-host", "expense-tracker-backend:127.0.0.1",
         "-v", f"{nginx}:/etc/nginx/conf.d/default.conf:ro", "--entrypoint", "nginx",
         f"expense-tracker-frontend:{tag}", "-t"])
    images = {}
    for part in ("backend", "frontend"):
        local = f"expense-tracker-{part}:{tag}"
        report = WORK / f"{tag}-{part}-scan.json"
        with report.open("wb") as output:
            run([*DOCKER, "run", "--rm", "-v", "/var/run/docker.sock:/var/run/docker.sock",
                 "aquasec/trivy:0.69.3", "image", "--image-src", "docker", "--scanners", "vuln",
                 "--format", "json", local], target=output)
        findings = [v for r in json.loads(report.read_text()).get("Results", []) for v in r.get("Vulnerabilities", [])]
        severe = [v for v in findings if v.get("Severity") in ("HIGH", "CRITICAL")]
        print(f"{part}: {len(severe)} HIGH/CRITICAL findings; full report retained at {report}")
        if any(v.get("FixedVersion") for v in severe):
            raise RuntimeError("Fixable HIGH/CRITICAL findings block deployment; review the scan report")
        images[part] = local
    # Both scans must pass before either image is published. Unfixed findings remain recorded.
    auth_dir = WORK / "docker-auth"
    auth_dir.mkdir(mode=0o700, exist_ok=True)
    try:
        password = run(["aws", "ecr", "get-login-password", "--region", REGION], capture=True)
        run([*DOCKER, "--config", auth_dir, "login", "--username", "AWS", "--password-stdin", REGISTRY],
            payload=(password + "\n").encode())
        for part in images:
            repo = f"expense-tracker-{part}"
            repository = aws("ecr", "describe-repositories", "--repository-names", repo)["repositories"][0]
            if repository["imageTagMutability"] != "IMMUTABLE":
                raise RuntimeError("ECR repository must use immutable tags")
            remote = f"{REGISTRY}/{repo}:{tag}"
            run([*DOCKER, "tag", images[part], remote])
            run([*DOCKER, "--config", auth_dir, "push", remote])
            digest = aws("ecr", "describe-images", "--repository-name", repo,
                         "--image-ids", f"imageTag={tag}")["imageDetails"][0]["imageDigest"]
            images[part] = f"{REGISTRY}/{repo}@{digest}"
    finally:
        # Docker ran through sudo; remove only its credential file with the same ownership.
        run(["sudo", "rm", "-f", str(auth_dir / "config.json")])
    (WORK / "images.json").write_text(json.dumps(images, indent=2) + "\n")
    return images


def cached_images():
    images = json.loads((WORK / "images.json").read_text())
    if set(images) != {"backend", "frontend"}:
        raise RuntimeError("Incomplete image cache; run prepare to build images")
    for part, image in images.items():
        prefix = f"{REGISTRY}/expense-tracker-{part}@"
        if not isinstance(image, str) or not image.startswith(prefix) or not re.fullmatch(r"sha256:[0-9a-f]{64}", image[len(prefix):]):
            raise RuntimeError("Cached image is not an expected ECR digest")
        detail = aws("ecr", "describe-images", "--repository-name", f"expense-tracker-{part}",
                     "--image-ids", "imageDigest=" + image[len(prefix):])["imageDetails"][0]
        reports = [WORK / f"{tag}-{part}-scan.json" for tag in detail.get("imageTags", [])
                   if re.fullmatch(r"eks-[0-9]{14}-[0-9a-f]{6}", tag)]
        reports = [path for path in reports if path.is_file()]
        if not reports:
            raise RuntimeError("Matching local vulnerability report missing; run prepare")
        report = json.loads(max(reports, key=lambda p: p.stat().st_mtime).read_text())
        findings = [v for result in report.get("Results", []) for v in result.get("Vulnerabilities", [])
                    if v.get("Severity") in ("HIGH", "CRITICAL")]
        if any(v.get("FixedVersion") for v in findings):
            raise RuntimeError("Cached image has fixable HIGH/CRITICAL vulnerabilities")
        print(f"Reusing {part} digest; recorded HIGH/CRITICAL findings: {len(findings)}")
    return images


def validate_existing_restore(backup):
    """Compare a read-only EKS snapshot with a disposable local backup restore."""
    container = "expense-tracker-backup-check-" + secrets.token_hex(6)
    run(["sudo", "-v"])
    run([*DOCKER, "run", "-d", "--name", container, "--network", "none",
         "--tmpfs", "/var/lib/postgresql/data:rw", "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
         "-e", "POSTGRES_DB=backup_check", "postgres:16"])
    try:
        deadline = time.monotonic() + 90
        while True:
            ready = subprocess.run([*DOCKER, "exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "backup_check"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
            if ready:
                break
            if time.monotonic() >= deadline:
                raise RuntimeError("Temporary local PostgreSQL did not become ready")
            time.sleep(2)
        with (backup / "database.dump").open("rb") as source:
            run([*DOCKER, "exec", "-i", container, "pg_restore", "--exit-on-error", "--single-transaction",
                 "--no-owner", "--no-acl", "-U", "postgres", "-d", "backup_check"], source=source)
        expected = run([*DOCKER, "exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                        "-U", "postgres", "-d", "backup_check"], payload=SNAPSHOT_SQL.encode(), capture=True)
        actual = run([*K, "exec", "-i", "expense-tracker-database-0", "--", "sh", "-c",
                      'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
                     payload=SNAPSHOT_SQL.encode(), capture=True)
        # Keep only private digest evidence, never row contents.
        (WORK / "backup-fingerprint.txt").write_text(expected + "\n")
        (WORK / "eks-fingerprint.txt").write_text(actual + "\n")
        if not expected or expected != actual:
            raise RuntimeError("Existing EKS database differs from the backup; no data was overwritten. Review private fingerprint files.")
        print("Existing EKS data matches the backup: columns, constraints, row counts, row hashes and sequences.")
    finally:
        # Delete only the isolated, randomly named verification container created above.
        run([*DOCKER, "rm", "-f", container])


def restore():
    backup = Path((ROOT / "work/eks-backups/latest-path.txt").read_text().strip()).resolve()
    dump = backup / "database.dump"
    uploads = backup / "uploads.tar.gz"
    fingerprint = hashlib.sha256(dump.read_bytes()).hexdigest()
    upload_fingerprint = hashlib.sha256(uploads.read_bytes()).hexdigest()
    # Refuse traversal and symlinks before extracting a private backup into the new volume.
    with tarfile.open(uploads, "r:gz") as archive:
        for entry in archive:
            path = Path(entry.name)
            if path.is_absolute() or ".." in path.parts or not path.parts or path.parts[0] != "uploads":
                raise RuntimeError("Unexpected upload archive path")
            if not (entry.isfile() or entry.isdir()):
                raise RuntimeError("Upload archive contains a link or special file")
    existing = marker("expense-tracker-database-restored")
    if existing and existing.get("sha256") != fingerprint:
        raise RuntimeError("Database restore marker refers to another backup")
    if not existing:
        if obj("get", "pods", "-l", "app=expense-tracker-backend")["items"]:
            raise RuntimeError("Backend pods already exist; refusing to restore a database in use")
        sql = "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
        count = run([*K, "exec", "expense-tracker-database-0", "--", "sh", "-c",
                     'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"', "sh", sql], capture=True)
        if count != "0":
            validate_existing_restore(backup)
        else:
            with dump.open("rb") as source:
                run([*K, "exec", "-i", "expense-tracker-database-0", "--", "sh", "-c",
                     'exec pg_restore --exit-on-error --single-transaction --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], source=source)
        mark("expense-tracker-database-restored", {"sha256": fingerprint})
    previous = marker("expense-tracker-uploads-restored")
    if previous:
        if previous.get("sha256") != upload_fingerprint:
            raise RuntimeError("Uploads restore marker refers to another backup")
        run([*K, "delete", "pod", "expense-tracker-upload-restore", "--ignore-not-found", "--wait=true"])
        return
    if obj("get", "pods", "-l", "app=expense-tracker-backend")["items"]:
        raise RuntimeError("Backend pods exist; refusing to change uploads in use")
    apply({"apiVersion": "v1", "kind": "PersistentVolumeClaim", "metadata": {"name": "expense-tracker-uploads"},
           "spec": {"accessModes": ["ReadWriteOnce"], "storageClassName": "expense-tracker-gp3",
                    "resources": {"requests": {"storage": "5Gi"}}}})
    apply({"apiVersion": "v1", "kind": "Pod", "metadata": {"name": "expense-tracker-upload-restore"},
           "spec": {"restartPolicy": "Never", "containers": [{"name": "restore", "image": "postgres:16",
                     "command": ["sleep", "3600"], "volumeMounts": [{"name": "uploads", "mountPath": "/restore"}]}],
                    "volumes": [{"name": "uploads", "persistentVolumeClaim": {"claimName": "expense-tracker-uploads"}}]}})
    run([*K, "wait", "--for=condition=Ready", "pod/expense-tracker-upload-restore", "--timeout=300s"])
    with uploads.open("rb") as source:
        run([*K, "exec", "-i", "expense-tracker-upload-restore", "--", "tar", "-C", "/restore", "-xzf", "-"], source=source)
    mark("expense-tracker-uploads-restored", {"sha256": upload_fingerprint})
    run([*K, "delete", "pod", "expense-tracker-upload-restore", "--wait=true"])


def deploy(images):
    # No HPA on a single-writer EBS volume. Recreate prevents overlapping backend writers.
    for part in ("backend", "frontend"):
        manifest = obj("create", "--dry-run=client", "-f", f"kubernetes/{part}/deployment.yaml")
        spec = manifest["spec"]
        pod = spec["template"]["spec"]
        pod["containers"][0]["image"] = images[part]
        pod["containers"][0]["imagePullPolicy"] = "IfNotPresent"
        if part == "backend":
            spec["replicas"] = 1
            spec["strategy"] = {"type": "Recreate"}
            pod.setdefault("volumes", []).append({"name": "uploads", "persistentVolumeClaim": {"claimName": "expense-tracker-uploads"}})
            pod["containers"][0].setdefault("volumeMounts", []).append({"name": "uploads", "mountPath": "/app/uploads", "subPath": "uploads"})
        apply(manifest)
    run([*K, "apply", "-f", "kubernetes/backend/service.yaml", "-f", "kubernetes/frontend/nginx-configmap.yaml"])
    for part in ("backend", "frontend"):
        run([*K, "rollout", "status", f"deployment/expense-tracker-{part}", "--timeout=300s"])
    with urllib.request.urlopen("https://checkip.amazonaws.com", timeout=20) as response:
        cidr = str(ipaddress.IPv4Address(response.read().decode().strip())) + "/32"
    service = obj("create", "--dry-run=client", "-f", "kubernetes/eks/frontend-loadbalancer.yaml")
    service["spec"]["loadBalancerSourceRanges"] = [cidr]
    apply(service)
    print("NLB candidate restricted to this terminal's public IP: " + cidr)
    print("Run the verify command after AWS assigns its load balancer hostname.")


def monitoring():
    run(["kubectl", "--context", CLUSTER, "apply", "-f", "kubernetes/monitoring/namespace.yaml"])
    secret = run(["kubectl", "--context", CLUSTER, "-n", "monitoring", "get", "secret", "grafana-admin",
                  "--ignore-not-found", "-o", "name"], capture=True)
    if not secret:
        password = WORK / "grafana-password"
        password.write_text(secrets.token_urlsafe(36))
        password.chmod(0o600)
        run(["kubectl", "--context", CLUSTER, "-n", "monitoring", "create", "secret", "generic", "grafana-admin",
             f"--from-file=password={password}"])
    run(["kubectl", "--context", CLUSTER, "apply", "-f", "kubernetes/monitoring/"])
    for name in ("prometheus", "grafana"):
        run(["kubectl", "--context", CLUSTER, "-n", "monitoring", "rollout", "status", f"deployment/{name}", "--timeout=300s"])


def verify():
    deadline = time.monotonic() + 300
    paths = ("/", "/api/health/live", "/api/health/ready", "/api/metrics")
    while True:
        service = obj("get", "service", "expense-tracker-frontend")
        entries = service.get("status", {}).get("loadBalancer", {}).get("ingress", [])
        if entries and entries[0].get("hostname"):
            url = "http://" + entries[0]["hostname"]
            try:
                for path in paths:
                    with urllib.request.urlopen(url + path, timeout=10) as response:
                        if response.status != 200:
                            raise OSError("Health check has not passed")
                break
            except OSError:
                pass
        if time.monotonic() >= deadline:
            raise RuntimeError("NLB smoke checks did not pass within five minutes; inspect service events and target health")
        print("Waiting for the NLB hostname, DNS and healthy targets...", flush=True)
        time.sleep(10)
    for path in paths:
        print(f"HTTP 200: {path}")
    mark("expense-tracker-candidate-checked", {"url": url, "scope": "HTTP health only; data cutover not approved"})
    print("Candidate URL: " + url)
    print("EC2 remains the source of truth. Do not use real credentials over HTTP or switch production traffic yet.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "resume", "verify"])
    args = parser.parse_args()
    os.umask(0o077)
    os.environ["AWS_PAGER"] = ""
    WORK.mkdir(parents=True, exist_ok=True)
    preflight()
    if args.command in ("prepare", "resume"):
        images = build() if args.command == "prepare" else cached_images()
        restore()
        deploy(images)
        monitoring()
        verify()
    else:
        verify()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, OSError, ValueError) as error:
        print(f"Stopped: {error}", file=sys.stderr)
        sys.exit(1)
