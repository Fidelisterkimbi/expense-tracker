# Validation evidence

## Local validation — 11 October 2026

Results observed in the WSL Ubuntu project working tree:

- Backend unittest suite: 7 tests passed in the local Python environment.
- Backend unittest suite: 7 tests passed inside the Docker image.
- Coverage includes registration, password hashing, duplicate registration,
  login, authentication enforcement, expense CRUD, input validation, and
  isolation between users.
- Docker Compose build and startup completed successfully.
- PostgreSQL, backend, and frontend containers passed their health checks.
- Frontend `/`: HTTP 200.
- API through Nginx `/api/`: HTTP 200.
- Prometheus endpoint `/api/metrics`: HTTP 200.
- Request count and request duration metrics were present.
- No files matched the tracked sensitive-file patterns checked with
  `git ls-files` (environment files, Terraform state/plans/variables,
  private key extensions, and kubernetes/secret.yaml).
  This was a filename check, not a full secret scan.

## Evidence still required

- Successful GitHub Actions run for the final submitted commit.
- Trivy scan results for the final backend and frontend images.
- Terraform validation for the relevant configurations.
- Kubernetes and monitoring manifest validation.
- Production deployment and smoke-test evidence, if required by the rubric.

Local results do not establish production deployment success.
EKS and Grafana/Prometheus cluster deployment have not been verified.
No push, production deployment, or EKS provisioning was performed
during these validation steps.

## Additional infrastructure and monitoring checks

- Root EC2 Terraform configuration: `terraform validate` passed.
- Separate EKS Terraform environment: `terraform validate` passed.
- Recursive Terraform formatting check passed.
- AWS describe-addon-versions response listed all five pinned add-on
  versions for Kubernetes 1.36 in us-east-1.
- Offline YAML parsing passed for 23 Kubernetes manifest objects,
  excluding the local secret.yaml.
- Frontend Nginx ConfigMap content and deployment mount wiring passed
  offline checks.
- Prometheus v3.5.0 promtool validated all four alert rules.
- Prometheus v3.5.0 promtool passed scrape configuration syntax validation.

These checks do not establish Kubernetes schema validity, live scraping,
alert delivery, working autoscaling, image availability, or successful
EKS deployment. Prometheus and Grafana currently use temporary emptyDir
storage. The existing kubectl context points to GKE and failed credential
refresh during attempted client dry-run validation; no resources were created.
