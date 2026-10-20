"""Exercise the restore-comparison SQL against an isolated PostgreSQL 16 server."""
import secrets
import subprocess
import time

from scripts.finish_eks import SNAPSHOT_SQL


def main():
    name = "expense-snapshot-sql-" + secrets.token_hex(5)
    def docker(*args, payload=None):
        return subprocess.run(["docker", *args], input=payload, check=True, stdout=subprocess.PIPE).stdout
    docker("run", "-d", "--name", name, "--network", "none", "--tmpfs", "/var/lib/postgresql/data:rw",
           "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16")
    try:
        for attempt in range(45):
            ready = subprocess.run(["docker", "exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(2)
        else:
            raise RuntimeError("PostgreSQL did not become ready")
        sql = b"CREATE TABLE example (id serial PRIMARY KEY, label varchar(80)); INSERT INTO example(label) VALUES ('alpha'),('beta');"
        docker("exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", payload=sql)
        def snapshot():
            return docker("exec", "-i", name, "psql", "-X", "-qAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
                          payload=SNAPSHOT_SQL.encode()).decode()
        first = snapshot()
        assert "table:example|2|" in first
        assert "sequence:example_id_seq|2|true" in first
        assert first == snapshot(), "Unchanged database produced a different fingerprint"
        docker("exec", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
               "UPDATE example SET label='modified' WHERE id=1;")
        assert first != snapshot(), "Changed row contents were not detected"
        print("PostgreSQL 16 comparison SQL: schema, row counts, row-content changes and sequences passed.")
    finally:
        docker("rm", "-f", name)


if __name__ == "__main__":
    main()
