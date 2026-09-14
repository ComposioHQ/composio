import base64
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / '.github/scripts/cli-release/publish-stable-manifest.py'
spec = importlib.util.spec_from_file_location('publisher', path)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class ManifestPublicationTest(unittest.TestCase):
    def setUp(self):
        self.current = None
        self.release = {
            'tagName': '@composio/cli@0.4.1', 'isDraft': False, 'isPrerelease': False,
            'assets': [{'name': name, 'state': 'uploaded'} for name in publisher.ASSETS],
        }
        self.writes = []
        self.releases = [
            {'tagName': '@composio/cli@0.4.1'},
            {'tagName': '@composio/cli@0.4.2-beta.1'},
            {'tagName': '@composio/core@99.0.0'},
            {'tagName': '@composio/cli@0.3.10'},
        ]

    def gh(self, *args, payload=None):
        if payload is not None:
            self.writes.append((args, payload))
            return {'sha': 'new-sha'}
        if args[:2] == ('release', 'list'):
            return self.releases
        if args[:2] == ('release', 'view'):
            return self.release
        if '/matching-refs/' in args[-1]:
            if self.current is None:
                return [{'ref': 'refs/heads/cli-stable-other', 'object': {'sha': 'unrelated'}}]
            return [{'ref': 'refs/heads/cli-stable', 'object': {'sha': 'old-sha'}}]
        if '/contents/version.txt?ref=old-sha' in args[-1]:
            return {'content': base64.b64encode(self.current.encode()).decode()}
        raise AssertionError(args)

    def publish(self):
        with patch.object(publisher, 'gh', self.gh):
            publisher.publish('ComposioHQ/composio')

    def test_api_payload_uses_explicit_post_and_preserves_patch(self):
        with patch.object(publisher.subprocess, 'run') as run:
            run.return_value.stdout = '{}'
            publisher.gh('api', 'repos/example/repo/git/trees', payload={'tree': []})
            command = run.call_args.args[0]
            self.assertEqual(command[command.index('--method') + 1], 'POST')
            publisher.gh('api', '--method', 'PATCH', 'repos/example/repo/git/refs/heads/cli-stable', payload={'force': False})
            command = run.call_args.args[0]
            self.assertEqual(command.count('--method'), 1)
            self.assertEqual(command[command.index('--method') + 1], 'PATCH')

    def test_bootstrap_ignores_beta_and_other_packages(self):
        self.publish()
        self.assertEqual(self.writes[0][1]['tree'][0]['content'], '0.4.1\n')
        self.assertEqual(self.writes[1][1]['parents'], [])
        self.assertEqual(self.writes[2][1]['ref'], 'refs/heads/cli-stable')

    def test_update_is_fast_forward_from_observed_head(self):
        self.current = '0.3.10\n'
        self.publish()
        self.assertEqual(self.writes[1][1]['parents'], ['old-sha'])
        self.assertEqual(self.writes[2][1], {'sha': 'new-sha', 'force': False})
        self.assertIn('PATCH', self.writes[2][0])

    def test_never_downgrades_or_republishes_same_version(self):
        for version in ['0.4.1', '0.4.10', '1.0.0']:
            with self.subTest(version=version):
                self.current = version
                self.publish()
                self.assertEqual(self.writes, [])

    def test_rejects_missing_and_processing_assets(self):
        for name in publisher.ASSETS:
            with self.subTest(asset=name):
                self.setUp()
                self.release['assets'] = [a for a in self.release['assets'] if a['name'] != name]
                with self.assertRaises(ValueError):
                    self.publish()
                self.assertEqual(self.writes, [])
        self.setUp()
        self.release['assets'][0]['state'] = 'starter'
        with self.assertRaises(ValueError):
            self.publish()
        self.assertEqual(self.writes, [])

    def test_rejects_draft_prerelease_and_mismatched_tag(self):
        for key, value in [('isDraft', True), ('isPrerelease', True), ('tagName', '@composio/cli@0.4.2')]:
            with self.subTest(key=key):
                self.setUp()
                self.release[key] = value
                with self.assertRaises(ValueError):
                    self.publish()
                self.assertEqual(self.writes, [])

    def test_missing_stable_and_invalid_current_fail_without_writes(self):
        self.releases = [{'tagName': '@composio/cli@0.4.2-beta.1'}]
        with self.assertRaises(ValueError):
            self.publish()
        self.setUp()
        self.current = 'broken'
        with self.assertRaises(ValueError):
            self.publish()
        self.assertEqual(self.writes, [])

    def test_concurrent_update_failure_is_not_force_retried(self):
        self.current = '0.4.0'
        original = self.gh
        def fail_update(*args, payload=None):
            if 'PATCH' in args:
                raise RuntimeError('non-fast-forward update rejected')
            return original(*args, payload=payload)
        with patch.object(publisher, 'gh', fail_update):
            with self.assertRaises(RuntimeError):
                publisher.publish('ComposioHQ/composio')
        self.assertEqual(len(self.writes), 2)


if __name__ == '__main__':
    unittest.main()
