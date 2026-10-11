from json_logging import JSONFormatter

bind = "0.0.0.0:5000"
workers = 2
timeout = 60

accesslog = "-"
errorlog = "-"
capture_output = True

access_log_format = (
    '%(h)s "%(m)s %(U)s" %(s)s %(L)s'
)

logconfig_dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": JSONFormatter
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "stream": "ext://sys.stdout"
        }
    },
    "loggers": {
        "gunicorn.error": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False
        },
        "gunicorn.access": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False
        }
    }
}
