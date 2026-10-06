import json
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app  # noqa: E402


class FakeSMTP:
    sent = []

    def __init__(self, sender):
        self.sender = sender

    def send_message(self, msg):
        FakeSMTP.sent.append((self.sender["email"], msg))

    def quit(self):
        pass


class AppTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        app.SENDERS_FILE = Path(cls.tmp.name) / "senders.json"
        app.LOG_FILE = Path(cls.tmp.name) / "send_log.jsonl"
        app.connect = FakeSMTP
        cls.server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    def setUp(self):
        FakeSMTP.sent = []
        app.save_senders([])

    def call(self, path, body=None):
        req = urllib.request.Request(
            self.base + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def add_senders(self):
        self.call("/api/senders", {"email": "a@gmail.com", "password": "abcd efgh", "name": "A"})
        self.call("/api/senders", {"email": "b@outlook.com", "password": "x"})

    def wait(self, job_id):
        for _ in range(100):
            _, job = self.call(f"/api/job?id={job_id}")
            if job["status"] != "running":
                return job
            time.sleep(0.05)
        self.fail("job did not finish")

    def test_index_served(self):
        with urllib.request.urlopen(self.base + "/") as r:
            self.assertEqual(r.status, 200)
            self.assertIn(b"Email Sender", r.read())

    def test_add_sender_uses_preset_and_hides_password(self):
        self.add_senders()
        _, senders = self.call("/api/senders")
        self.assertEqual([s["host"] for s in senders], ["smtp.gmail.com", "smtp-mail.outlook.com"])
        self.assertNotIn("password", json.dumps(senders))
        self.assertEqual(app.load_senders()[0]["password"], "abcdefgh")

    def test_unknown_provider_requires_host(self):
        code, body = self.call("/api/senders", {"email": "me@custom.dev", "password": "x"})
        self.assertEqual(code, 400)
        self.assertIn("SMTP host", body["error"])

    def test_parse_recipients(self):
        recipients, invalid = app.parse_recipients("Jane <Jane@x.com>\nbob@y.com, bad; jane@x.com")
        self.assertEqual(recipients, [("Jane", "jane@x.com"), ("", "bob@y.com")])
        self.assertEqual(invalid, ["bad"])

    def test_rotate_mode_splits_and_personalises(self):
        self.add_senders()
        _, job = self.call("/api/send", {
            "senders": ["a@gmail.com", "b@outlook.com"],
            "recipients": "Jane <jane@x.com>\nbob@y.com\nc@z.org",
            "subject": "Hi {name}", "body": "Hello {name} ({email})", "mode": "rotate", "delay": 0,
        })
        job = self.wait(job["id"])
        self.assertEqual((job["status"], job["sent"], job["failed"]), ("done", 3, 0))
        self.assertEqual([s for s, _ in FakeSMTP.sent], ["a@gmail.com", "b@outlook.com", "a@gmail.com"])
        first = FakeSMTP.sent[0][1]
        self.assertEqual(first["Subject"], "Hi Jane")
        self.assertIn("Hello Jane (jane@x.com)", first.get_content())

    def test_all_mode_sends_from_every_sender(self):
        self.add_senders()
        _, job = self.call("/api/send", {
            "senders": ["a@gmail.com", "b@outlook.com"], "recipients": "x@y.com, z@y.com",
            "subject": "S", "body": "B", "mode": "all", "delay": 0,
        })
        self.assertEqual(self.wait(job["id"])["sent"], 4)

    def test_send_one_for_extension(self):
        self.add_senders()
        code, entry = self.call("/api/send-one", {
            "from": "b@outlook.com", "to": "Jane@X.com", "name": "Jane",
            "subject": "Hi {name}", "body": "Hello {email}", "html": False,
        })
        self.assertEqual((code, entry["ok"], entry["to"]), (200, True, "jane@x.com"))
        sender, msg = FakeSMTP.sent[0]
        self.assertEqual((sender, msg["Subject"]), ("b@outlook.com", "Hi Jane"))
        self.assertIn("Hello jane@x.com", msg.get_content())
        code, body = self.call("/api/send-one", {"from": "nobody@x.com", "to": "a@b.co", "subject": "s", "body": "b"})
        self.assertEqual((code, body["error"]), (400, "Unknown sender"))

    def test_send_validation(self):
        self.add_senders()
        code, body = self.call("/api/send", {"senders": [], "recipients": "x@y.com", "subject": "s", "body": "b"})
        self.assertEqual((code, body["error"]), (400, "Pick at least one sender"))
        code, _ = self.call("/api/send", {"senders": ["a@gmail.com"], "recipients": "nope", "subject": "s", "body": "b"})
        self.assertEqual(code, 400)


if __name__ == "__main__":
    unittest.main()
