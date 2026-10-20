import io
import json
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from scripts import finish_eks as deploy


class DeploymentSafetyTests(unittest.TestCase):
    def test_wrong_account_stops_before_cluster_access(self):
        with patch.object(deploy, "aws", return_value={"Account": "000000000000"}), patch.object(deploy, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "Wrong AWS account"):
                deploy.preflight()
            run.assert_not_called()

    def test_misleading_context_name_is_rejected_by_endpoint(self):
        def aws(*args):
            if args[0] == "sts":
                return {"Account": deploy.ACCOUNT}
            return {"cluster": {"endpoint": "https://intended-eks.example"}}

        context = {"clusters": [{"cluster": {"server": "https://other-cluster.example"}}]}
        with patch.object(deploy, "aws", side_effect=aws), patch.object(deploy, "run", return_value=json.dumps(context)) as run:
            with self.assertRaisesRegex(RuntimeError, "does not match"):
                deploy.preflight()
            self.assertEqual(run.call_count, 1)

    def backup(self, root, name="uploads/profiles/example.png"):
        backup = root / "backup"
        backup.mkdir()
        (backup / "database.dump").write_bytes(b"private-placeholder")
        with tarfile.open(backup / "uploads.tar.gz", "w:gz") as archive:
            entry = tarfile.TarInfo(name)
            entry.size = 1
            archive.addfile(entry, io.BytesIO(b"x"))
        pointer = root / "work/eks-backups/latest-path.txt"
        pointer.parent.mkdir(parents=True)
        pointer.write_text(str(backup))

    def test_archive_traversal_stops_before_any_cluster_write(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.backup(root, "uploads/../../escape")
            with patch.object(deploy, "ROOT", root), patch.object(deploy, "run") as run, patch.object(deploy, "apply") as apply:
                with self.assertRaisesRegex(RuntimeError, "Unexpected upload archive path"):
                    deploy.restore()
                run.assert_not_called()
                apply.assert_not_called()

    def test_different_nonempty_database_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.backup(root)
            with patch.object(deploy, "ROOT", root), patch.object(deploy, "marker", return_value=None), \
                 patch.object(deploy, "obj", return_value={"items": []}), \
                 patch.object(deploy, "run", return_value="7") as run, patch.object(deploy, "apply") as apply, \
                 patch.object(deploy, "validate_existing_restore", side_effect=RuntimeError("Database differs")):
                with self.assertRaisesRegex(RuntimeError, "differs"):
                    deploy.restore()
                self.assertEqual(run.call_count, 1)
                self.assertNotIn("pg_restore", " ".join(run.call_args.args[0]))
                apply.assert_not_called()

    def test_fingerprint_mismatch_stops_and_cleans_up_only_local_container(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.backup(root)
            def run(args, **kwargs):
                if "psql" in args:
                    return "table:users|2|expected"
                if args[:len(deploy.K)] == deploy.K:
                    return "table:users|3|different"
                return ""
            with patch.object(deploy, "WORK", root), patch.object(deploy, "run", side_effect=run) as calls, \
                 patch.object(deploy.subprocess, "run", return_value=SimpleNamespace(returncode=0)):
                with self.assertRaisesRegex(RuntimeError, "differs"):
                    deploy.validate_existing_restore(root / "backup")
                self.assertIn("rm", calls.call_args.args[0])
                for call in calls.call_args_list:
                    args = call.args[0]
                    if args[:len(deploy.K)] == deploy.K:
                        self.assertNotIn("pg_restore", " ".join(args))

    def test_matching_fingerprint_is_accepted(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.backup(root)
            with patch.object(deploy, "WORK", root), patch.object(deploy, "run", return_value="matching-private-fingerprint"), \
                 patch.object(deploy.subprocess, "run", return_value=SimpleNamespace(returncode=0)):
                deploy.validate_existing_restore(root / "backup")


if __name__ == "__main__":
    unittest.main()
