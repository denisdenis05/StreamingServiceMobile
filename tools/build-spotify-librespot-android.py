import argparse
import os
from pathlib import Path
import shutil
import subprocess


class BuildPolicy:
    project_parent_position = 1
    arm_architecture = "arm64-v8a"
    emulator_architecture = "x86_64"
    architecture_targets = {arm_architecture: "aarch64-linux-android", emulator_architecture: "x86_64-linux-android"}
    platform_api = "24"
    host_toolchain = "linux-x86_64"
    toolchain_folder = "toolchains/llvm/prebuilt"
    library_name = "libstreaming_spotify_session.so"
    crate_folder = "native/librespot-session"
    cargo_program = "cargo"
    cargo_environment = "CARGO"
    ndk_argument = "--ndk-directory"
    output_argument = "--output-directory"
    architectures_argument = "--architectures"
    manifest_argument = "--manifest-path"
    target_argument = "--target"
    release_argument = "--release"
    locked_argument = "--locked"
    build_command = "build"
    manifest_filename = "Cargo.toml"
    target_folder = "target"
    release_folder = "release"
    binary_folder = "bin"
    compiler_suffix = "-clang"
    archive_program = "llvm-ar"
    linker_environment_prefix = "CARGO_TARGET_"
    linker_environment_suffix = "_LINKER"
    compiler_environment_prefix = "CC_"
    archive_environment_prefix = "AR_"
    target_separator = "-"
    environment_separator = "_"
    rust_flags_environment = "RUSTFLAGS"
    page_alignment_flags = "-C link-arg=-Wl,-z,max-page-size=16384"
    separator = ","
    flag_separator = " "
    empty_text = ""
    unsupported_architecture_message = "Spotify session builds support arm64-v8a and x86_64 only."
    missing_cargo_message = "Cargo is required to build the Spotify session library."
    missing_compiler_message = "The requested Android NDK API 24 compiler is unavailable."
    missing_output_message = "The Spotify session build produced no native library."


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(BuildPolicy.ndk_argument, required=True, type=Path)
    parser.add_argument(BuildPolicy.output_argument, required=True, type=Path)
    parser.add_argument(BuildPolicy.architectures_argument, default=BuildPolicy.arm_architecture)
    arguments = parser.parse_args()
    architectures = arguments.architectures.split(BuildPolicy.separator)
    if not architectures or len(set(architectures)) != len(architectures) or any(
        architecture not in BuildPolicy.architecture_targets for architecture in architectures
    ):
        raise SystemExit(BuildPolicy.unsupported_architecture_message)
    project = Path(__file__).resolve().parents[BuildPolicy.project_parent_position]
    crate = project / BuildPolicy.crate_folder
    toolchain = arguments.ndk_directory / BuildPolicy.toolchain_folder / BuildPolicy.host_toolchain / BuildPolicy.binary_folder
    cargo = os.environ.get(BuildPolicy.cargo_environment) or shutil.which(BuildPolicy.cargo_program)
    if not cargo:
        raise SystemExit(BuildPolicy.missing_cargo_message)
    for architecture in architectures:
        target = BuildPolicy.architecture_targets[architecture]
        compiler = toolchain / (target + BuildPolicy.platform_api + BuildPolicy.compiler_suffix)
        if not compiler.is_file():
            raise SystemExit(BuildPolicy.missing_compiler_message)
        environment_target = target.replace(BuildPolicy.target_separator, BuildPolicy.environment_separator)
        environment = os.environ.copy()
        environment[BuildPolicy.linker_environment_prefix + environment_target.upper() + BuildPolicy.linker_environment_suffix] = str(compiler)
        environment[BuildPolicy.compiler_environment_prefix + environment_target] = str(compiler)
        environment[BuildPolicy.archive_environment_prefix + environment_target] = str(toolchain / BuildPolicy.archive_program)
        environment[BuildPolicy.rust_flags_environment] = (
            environment.get(BuildPolicy.rust_flags_environment, BuildPolicy.empty_text)
            + BuildPolicy.flag_separator + BuildPolicy.page_alignment_flags
        ).strip()
        subprocess.run([cargo, BuildPolicy.build_command, BuildPolicy.locked_argument, BuildPolicy.release_argument,
                        BuildPolicy.target_argument, target, BuildPolicy.manifest_argument,
                        str(crate / BuildPolicy.manifest_filename)], env=environment, check=True)
        library = crate / BuildPolicy.target_folder / target / BuildPolicy.release_folder / BuildPolicy.library_name
        if not library.is_file():
            raise SystemExit(BuildPolicy.missing_output_message)
        output = arguments.output_directory / architecture
        output.mkdir(parents=True, exist_ok=True)
        shutil.copy2(library, output / BuildPolicy.library_name)


if __name__ == "__main__":
    main()
