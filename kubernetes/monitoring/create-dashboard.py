import json
from pathlib import Path

dashboard = {
    "uid": "expense-tracker",
    "title": "Expense Tracker - Application Monitoring",
    "tags": ["expense-tracker", "devops"],
    "timezone": "browser",
    "schemaVersion": 39,
    "version": 1,
    "refresh": "15s",
    "time": {"from": "now-1h", "to": "now"},
    "panels": [],
}

panels = [
    (
        "HTTP Requests per Second",
        'sum(rate(expense_tracker_http_requests_total[5m]))',
        "reqps",
    ),
    (
        "HTTP Error Rate (%)",
        '100 * sum(rate(expense_tracker_http_requests_total{status=~"5.."}[5m])) / clamp_min(sum(rate(expense_tracker_http_requests_total[5m])), 0.000001)',
        "percent",
    ),
    (
        "95th Percentile Response Time",
        'histogram_quantile(0.95, sum by (le) (rate(expense_tracker_http_request_duration_seconds_bucket[5m])))',
        "s",
    ),
    (
        "Requests by HTTP Status",
        'sum by (status) (rate(expense_tracker_http_requests_total[5m]))',
        "reqps",
    ),
]

for index, (title, expression, unit) in enumerate(panels):
    dashboard["panels"].append({
        "id": index + 1,
        "title": title,
        "type": "timeseries",
        "datasource": {
            "type": "prometheus",
            "uid": "prometheus",
        },
        "gridPos": {
            "h": 8,
            "w": 12,
            "x": (index % 2) * 12,
            "y": (index // 2) * 8,
        },
        "targets": [{
            "expr": expression,
            "refId": "A",
        }],
        "fieldConfig": {
            "defaults": {"unit": unit},
            "overrides": [],
        },
        "options": {
            "legend": {
                "displayMode": "list",
                "placement": "bottom",
            }
        },
    })

Path("kubernetes/monitoring/dashboard.json").write_text(
    json.dumps(dashboard, indent=2) + "\n"
)

print("SUCCESS: Grafana dashboard JSON created.")
print("Panels:", len(dashboard["panels"]))
