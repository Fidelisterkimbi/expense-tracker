# Expense Tracker DevOps Capstone

## Architecture
Browser -> Nginx :80 -> /api/ -> Flask/Gunicorn :5000 -> PostgreSQL :5432.
Docker Compose exposes the frontend on port 80 and persists PostgreSQL
data in the postgres_data volume.

## Local setup
Requires Docker Engine, Docker Compose, and an available port 80.
Create an untracked .env in the repository root with POSTGRES_DB,
POSTGRES_USER, POSTGRES_PASSWORD, and JWT_SECRET_KEY.
Use strong random secrets. Database passwords must be URL-safe unless
properly encoded in DATABASE_URL.

Run from the repository root:
    docker compose up -d --build --wait --wait-timeout 120
    docker compose ps
    curl --fail http://127.0.0.1/
    curl --fail http://127.0.0.1/api/
    curl --fail http://127.0.0.1/api/metrics

Open http://localhost/ and register a test account.
Stop with docker compose down. Adding -v deletes database volume data.

## Tests
After building the backend image, run:
    docker compose run --rm --no-deps --entrypoint sh backend -c 'mkdir -p "$PROMETHEUS_MULTIPROC_DIR" && python -m unittest discover -s /app -p test_app.py -v'

Seven tests cover authentication, password hashing, expense CRUD,
validation, and isolation between users. Tests use in-memory SQLite.
PostgreSQL integration is a separate check.

## CI/CD and production
.github/workflows/deploy.yml validates Compose, builds images, runs tests,
scans images with Trivy, and checks frontend/API responses.
Pull requests validate; successful pushes to main automatically deploy to EC2.
Do not push to main without explicit production deployment approval.
Deployment uses AWS_ROLE_ARN, EC2_SSH_KEY, EC2_USER, and EC2_HOST.
The current deployment resets EC2 to origin/main rather than the tested SHA;
correct this before final deployment. Docker Hub publication is not configured.

## Terraform
terraform/ manages EC2; terraform/environments/eks/ is separate.
Both environments passed terraform validate.
Recursive terraform fmt -check passed.
EKS defaults to two on-demand t3.medium workers, scaling up to four.
EKS provisioning requires explicit cost approval and plan review.
Validation does not establish deployment success.

## Kubernetes and monitoring
Manifests define probes, resource limits, replicas, and CPU HPAs.
The frontend deployment mounts nginx-configmap.yaml for backend routing.
Docker Hub latest images still require publication and immutable selection.
CPU HPAs require Metrics Server.
Database storage requires EBS CSI, IAM permissions, and the gp3 StorageClass.
Retained database volumes may continue costing money after PVC deletion.
Application secrets must be created separately.
Grafana needs a grafana-admin Secret with a password key.
Prometheus and Grafana use temporary emptyDir storage and ClusterIP services.
Four alert rules passed promtool validation; notification delivery is unverified.
Confirm kubectl context before cluster operations; the existing context is GKE.

## Evidence and remaining work
See [validation evidence](docs/validation-evidence.md).
Seven tests passed locally and in Docker. All Compose services were healthy.
Frontend, API, and metrics returned HTTP 200.
Terraform validation/formatting, 23 manifest objects parsed, frontend ConfigMap
wiring, and Prometheus configuration/rule checks passed.
Full Kubernetes schema/runtime validation, final Trivy results, final CI run,
and approved production deployment evidence remain outstanding.
Confirm the assignment rubric before claiming completion.
Keep secrets, private keys, Terraform state/plans/variables untracked.

## Mobile apps
See [Android and iPhone setup and builds](mobile/README.md).
