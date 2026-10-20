# EKS candidate deployment

## Observed status on 20 October 2026

The user-provided AWS output reports an ACTIVE expense-tracker-eks cluster in
us-east-1, two Ready c7i-flex.large workers, five healthy EKS add-ons, and an
AWS Load Balancer Controller 3.6.0 deployment with two ready replicas. PostgreSQL
has a Bound 5 GiB gp3 volume. Private backups of EC2 PostgreSQL and uploads were
created in the Ubuntu checkout. The database restore and EKS application have
not yet been verified. This document is not evidence of completed deployment.

Codex's Windows environment cannot access WSL (Wsl/E_ACCESSDENIED). Execute the
remaining command from the existing authenticated Ubuntu project terminal.

## Prepare the candidate

After fetching this branch, preserve the Ubuntu checkout's worker-type change:

```bash
git fetch origin codex/eks-deployment
git stash push -m 'local EKS worker selection' -- terraform/modules/eks/variables.tf
git switch --track origin/codex/eks-deployment
python3 scripts/finish_eks.py prepare
```

If preparation already built and published images but stopped at a nonempty
database, pull the latest branch and run `python3 scripts/finish_eks.py resume`.
Resume checks the recorded image digests and scan reports without rebuilding.
For an unmarked, nonempty database it restores the backup into a disposable local
PostgreSQL container with no network access, then compares columns, constraints,
row counts, ordered row-content hashes and sequence states against a read-only
snapshot of EKS. Only an exact match is adopted. A mismatch stops without writing
to EKS data. Temporary local PostgreSQL uses tmpfs and is removed afterward;
private hash evidence stays under work/. This verifies the initial snapshot,
not subsequent EC2 writes or application behavior.

Only stash the worker file if it is modified; do not stash secrets or backups.
The branch already includes the c7i-flex.large change. Do not drop other work.
The script requires the existing work/eks-backups/latest-path.txt, application
Secret, database StatefulSet, ECR repositories, kubectl context, AWS CLI, Docker,
sudo, and internet access. No Terraform apply, EC2 modification, or database
deletion is performed by this script.

The script verifies the AWS account and context endpoint, rebuilds the new health
endpoints, runs backend tests and Nginx syntax validation, and scans both images.
It keeps full Trivy reports under ignored work/ and blocks fixable HIGH/CRITICAL
vulnerabilities. Unfixed findings remain reported; this follows the existing CI
policy and does not mean zero vulnerabilities or establish exploitability.
The previous ECR backend scan reported three HIGH findings; frontend scanning
was pending. Existing candidate digests are not reused because they lack the
new health endpoints.

The restore requires an empty destination database and uses a single transaction
without --clean. A hash marker records each completed restore. A nonempty database
without a marker must match the isolated backup comparison before being adopted;
it is never overwritten. Keep all private backup, credential and state files local.
Script markers allow resuming the same snapshot, but do not prove production
data parity. A restore failure rolls back the database transaction.

Uploads use a separate retained 5 GiB gp3 claim. The backend uses one replica and
Recreate deployment to avoid overlapping writers on EBS. Backend HPA is deliberately
not applied. Use EFS or object storage before scaling backend replicas across nodes.

The NLB admits only the terminal's current public IPv4 address. This is a candidate,
not a production cutover. No DNS changes are made. If the IP changes, update both
the EKS API allowlist and NLB source ranges deliberately.

After AWS assigns an NLB hostname, verify health:

```bash
python3 scripts/finish_eks.py verify
```

Keep the EC2 app as the source of truth. Do not enter real credentials through
the candidate HTTP endpoint. Before production use: provision a domain and ACM
certificate with TLS on the NLB, verify registration/login and expense isolation,
compare restored table counts and profile files against the snapshot, verify
alerts/scraping, and agree how to capture writes made since the initial backup.
A final write pause or replication plan requires separate coordination. No EC2
shutdown or destructive migration is authorized by this script.

## Monitoring, CI and infrastructure ownership

Prometheus and Grafana remain ClusterIP-only. Grafana's generated password stays
in work/eks-finish/grafana-password, never Git. Their existing emptyDir storage is
temporary; dashboard/history retention and external alert delivery are not
configured. Verify Prometheus targets through port forwarding and configure a
notification destination before claiming monitoring completion.

The added GitHub workflow validates EKS Terraform, Python, manifests, backend
tests and frontend configuration. It does not deploy. Existing deploy.yml still
contains the manually triggered EC2 job; do not dispatch it for EKS. Continuous
delivery via GitHub OIDC needs a dedicated role, restricted repository/environment
trust, EKS access entry and runner API connectivity. Those are not configured by
the candidate script. Avoid broadening API access to 0.0.0.0/0 for hosted runners.

The user-created EKS admin access entry, controller role, inline policy and Pod
Identity association were created outside Terraform. Import them into matching
Terraform resources before managing them with Terraform; do not recreate or delete
them. This branch adds 30-day EKS control-plane logs: generate and review a fresh
EKS-only plan before applying it. If a log group already exists, import it first.
Keep the existing Terraform state and never apply root terraform/ for this task.

When data copying is complete, remove only the temporary SSH rule:

```bash
aws ec2 revoke-security-group-ingress --region us-east-1 \
  --group-id sg-093d2e618f18ef461 \
  --security-group-rule-ids sgr-0b6f3d08fcf232483
```

Actual charges require billing access. Budget for the running control plane,
two c7i-flex.large workers, worker disks, two 5 GiB data volumes, NLB/capacity
units, public IPv4, logs, ECR, transfer and retained EC2. Free Tier eligibility
does not guarantee free usage. The earlier $150–$250+ estimate is not an actual
bill, and changing worker type can change that estimate. Do not delete PVCs,
retained volumes or EC2 to save costs without separate approval.
