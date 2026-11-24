import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


class BuildFixture:
    script = Path(__file__).with_name("build-spotify-librespot-android.py")
    module_name = "spotify_android_build"
    root_filename = "build.py"
    cargo = "/synthetic/cargo"
    library_contents = b"synthetic-native-library"
    unsupported_architecture = "armeabi-v7a"
    first_position = 0
    single_count = 1
    target_option = "--target"


specification = importlib.util.spec_from_file_location(BuildFixture.module_name, BuildFixture.script)
build = importlib.util.module_from_spec(specification)
specification.loader.exec_module(build)


class AndroidBuildArchitectureTests(unittest.TestCase):
    def run_build(self, architectures):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            script = project / "tools" / BuildFixture.root_filename
            toolchain = project / build.BuildPolicy.toolchain_folder / build.BuildPolicy.host_toolchain / build.BuildPolicy.binary_folder
            toolchain.mkdir(parents=True)
            for target in build.BuildPolicy.architecture_targets.values():
                (toolchain / (target + build.BuildPolicy.platform_api + build.BuildPolicy.compiler_suffix)).touch()
                library = project / build.BuildPolicy.crate_folder / build.BuildPolicy.target_folder / target / build.BuildPolicy.release_folder / build.BuildPolicy.library_name
                library.parent.mkdir(parents=True)
                library.write_bytes(BuildFixture.library_contents)
            output = project / "output"
            arguments = [str(script), build.BuildPolicy.ndk_argument, str(project), build.BuildPolicy.output_argument, str(output), build.BuildPolicy.architectures_argument, architectures]
            with patch.object(build, "__file__", str(script)), patch("sys.argv", arguments), patch.dict(build.os.environ, {build.BuildPolicy.cargo_environment: BuildFixture.cargo}), patch.object(build.subprocess, "run") as invocation:
                build.main()
                calls = invocation.call_args_list
            copied = {library.parent.name: library.read_bytes() for library in output.glob("*/" + build.BuildPolicy.library_name)}
            return calls, copied

    def test_each_supported_architecture_uses_its_own_target_and_compiler(self):
        for architecture, target in build.BuildPolicy.architecture_targets.items():
            with self.subTest(architecture=architecture):
                calls, copied = self.run_build(architecture)
                self.assertEqual(len(calls), BuildFixture.single_count)
                command = calls[BuildFixture.first_position].args[BuildFixture.first_position]
                self.assertEqual(command[command.index(BuildFixture.target_option) + BuildFixture.single_count], target)
                environment_target = target.replace(build.BuildPolicy.target_separator, build.BuildPolicy.environment_separator)
                environment = calls[BuildFixture.first_position].kwargs["env"]
                self.assertTrue(environment[build.BuildPolicy.compiler_environment_prefix + environment_target].endswith(target + build.BuildPolicy.platform_api + build.BuildPolicy.compiler_suffix))
                self.assertEqual(copied, {architecture: BuildFixture.library_contents})

    def test_combined_delivery_packages_both_requested_libraries(self):
        architectures = build.BuildPolicy.separator.join(build.BuildPolicy.architecture_targets)
        calls, copied = self.run_build(architectures)
        self.assertEqual(len(calls), len(build.BuildPolicy.architecture_targets))
        self.assertEqual(set(copied), set(build.BuildPolicy.architecture_targets))

    def test_unsupported_and_duplicate_architectures_fail_without_fallback(self):
        for architectures in [BuildFixture.unsupported_architecture, build.BuildPolicy.empty_text, build.BuildPolicy.separator.join([build.BuildPolicy.arm_architecture, build.BuildPolicy.arm_architecture])]:
            with self.subTest(architectures=architectures), self.assertRaises(SystemExit):
                self.run_build(architectures)


if __name__ == "__main__":
    unittest.main()
