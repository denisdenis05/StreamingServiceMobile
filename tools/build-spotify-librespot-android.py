import argparse
import os
from pathlib import Path
import shutil
import subprocess


class BuildPolicy:
    project_parent_position = 1
    arm_architecture = "arm64-v8a"
    target = "aarch64-linux-android"
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
    linker_environment = "CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER"
    compiler_environment = "CC_aarch64_linux_android"
    archive_environment = "AR_aarch64_linux_android"
    rust_flags_environment = "RUSTFLAGS"
    page_alignment_flags = "-C link-arg=-Wl,-z,max-page-size=16384"
    separator = ","
    flag_separator = " "
    empty_text = ""
    unsupported_architecture_message = "Spotify session builds currently support arm64-v8a only. Set reactNativeArchitectures=arm64-v8a."
    missing_cargo_message = "Cargo is required to build the Spotify session library."
    missing_compiler_message = "The Android NDK API 24 ARM64 compiler is unavailable."
    missing_output_message = "The Spotify session build produced no native library."


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(BuildPolicy.ndk_argument, required=True, type=Path)
    parser.add_argument(BuildPolicy.output_argument, required=True, type=Path)
    parser.add_argument(BuildPolicy.architectures_argument, default=BuildPolicy.arm_architecture)
    arguments = parser.parse_args()
    architectures = arguments.architectures.split(BuildPolicy.separator)
    if architectures != [BuildPolicy.arm_architecture]:
        raise SystemExit(BuildPolicy.unsupported_architecture_message)
    project = Path(__file__).resolve().parents[BuildPolicy.project_parent_position]
    crate = project / BuildPolicy.crate_folder
    toolchain = arguments.ndk_directory / BuildPolicy.toolchain_folder / BuildPolicy.host_toolchain / BuildPolicy.binary_folder
    compiler = toolchain / (BuildPolicy.target + BuildPolicy.platform_api + BuildPolicy.compiler_suffix)
    if not compiler.is_file():
        raise SystemExit(BuildPolicy.missing_compiler_message)
    cargo = os.environ.get(BuildPolicy.cargo_environment) or shutil.which(BuildPolicy.cargo_program)
    if not cargo:
        raise SystemExit(BuildPolicy.missing_cargo_message)
    environment = os.environ.copy()
    environment[BuildPolicy.linker_environment] = str(compiler)
    environment[BuildPolicy.compiler_environment] = str(compiler)
    environment[BuildPolicy.archive_environment] = str(toolchain / BuildPolicy.archive_program)
    environment[BuildPolicy.rust_flags_environment] = (
        environment.get(BuildPolicy.rust_flags_environment, BuildPolicy.empty_text)
        + BuildPolicy.flag_separator + BuildPolicy.page_alignment_flags
    ).strip()
    subprocess.run([cargo, BuildPolicy.build_command, BuildPolicy.locked_argument, BuildPolicy.release_argument,
                    BuildPolicy.target_argument, BuildPolicy.target, BuildPolicy.manifest_argument,
                    str(crate / BuildPolicy.manifest_filename)], env=environment, check=True)
    library = crate / BuildPolicy.target_folder / BuildPolicy.target / BuildPolicy.release_folder / BuildPolicy.library_name
    if not library.is_file():
        raise SystemExit(BuildPolicy.missing_output_message)
    output = arguments.output_directory / BuildPolicy.arm_architecture
    output.mkdir(parents=True, exist_ok=True)
    shutil.copy2(library, output / BuildPolicy.library_name)


if __name__ == "__main__":
    main()
