import os
import time

from flask import Blueprint, Response, g, request
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Histogram,
    generate_latest,
    CollectorRegistry,
    multiprocess,
)

metrics_blueprint = Blueprint("metrics", __name__)

REQUEST_COUNT = Counter(
    "expense_tracker_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

REQUEST_DURATION = Histogram(
    "expense_tracker_http_request_duration_seconds",
    "HTTP request duration",
    ["method", "endpoint"],
)


def setup_metrics(app):
    @app.before_request
    def before_request():
        g.metrics_start = time.perf_counter()

    @app.after_request
    def after_request(response):
        if request.path == "/metrics":
            return response

        endpoint = (
            request.url_rule.rule
            if request.url_rule
            else "unmatched"
        )

        REQUEST_COUNT.labels(
            request.method,
            endpoint,
            str(response.status_code),
        ).inc()

        REQUEST_DURATION.labels(
            request.method,
            endpoint,
        ).observe(
            time.perf_counter()
            - getattr(g, "metrics_start", time.perf_counter())
        )

        return response

    app.register_blueprint(metrics_blueprint)


@metrics_blueprint.route("/metrics")
def metrics():
    if os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
        data = generate_latest(registry)
    else:
        data = generate_latest()

    return Response(
        data,
        mimetype=CONTENT_TYPE_LATEST,
    )
