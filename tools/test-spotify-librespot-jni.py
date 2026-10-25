import os
from pathlib import Path
import shutil
import subprocess


class TestPolicy:
    project_parent_position = 1
    cargo_environment = "CARGO"
    cargo_program = "cargo"
    compiler_program = "javac"
    runtime_program = "java"
    test_command = "test"
    build_command = "build"
    locked_argument = "--locked"
    manifest_argument = "--manifest-path"
    manifest_path = "native/librespot-session/Cargo.toml"
    library_path = "native/librespot-session/target/debug/libstreaming_spotify_session.so"
    class_folder = ".build/librespot-jni-tools"
    source_path = "tools/fixtures/librespot-jni/com/streamingservice/spotify/SpotifyLibrespotNative.java"
    output_argument = "-d"
    classpath_argument = "-cp"
    library_property = "-Dstreamingservice.spotify.nativeLibrary="
    main_class = "com.streamingservice.spotify.SpotifyLibrespotNative"
    missing_tools_message = "Cargo and a JDK are required for the host Spotify JNI checks."


def main():
    project = Path(__file__).resolve().parents[TestPolicy.project_parent_position]
    cargo = os.environ.get(TestPolicy.cargo_environment) or shutil.which(TestPolicy.cargo_program)
    compiler = shutil.which(TestPolicy.compiler_program)
    runtime = shutil.which(TestPolicy.runtime_program)
    if not cargo or not compiler or not runtime:
        raise SystemExit(TestPolicy.missing_tools_message)
    manifest = project / TestPolicy.manifest_path
    for command in [TestPolicy.test_command, TestPolicy.build_command]:
        subprocess.run([cargo, command, TestPolicy.locked_argument, TestPolicy.manifest_argument, str(manifest)], cwd=project, check=True)
    output = project / TestPolicy.class_folder
    output.mkdir(parents=True, exist_ok=True)
    subprocess.run([compiler, TestPolicy.output_argument, str(output), str(project / TestPolicy.source_path)], cwd=project, check=True)
    subprocess.run([runtime, TestPolicy.library_property + str(project / TestPolicy.library_path),
                    TestPolicy.classpath_argument, str(output), TestPolicy.main_class], cwd=project, check=True)


if __name__ == "__main__":
    main()
