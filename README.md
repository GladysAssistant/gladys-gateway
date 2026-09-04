# Gladys Gateway

## Context

The Gladys Gateway is an end-to-end encrypted gateway between your local Gladys installation (your Raspberry Pi at home for example), and your browser on the internet.

When you are away from home, it becomes easier with the Gladys Gateway to control your home without having to open any ports on your internet box.

## How to use the Gladys Gateway?

To subscribe to Gladys Plus:

- [French users](https://gladysassistant.com/fr/plus/)
- [International users](https://gladysassistant.com/plus/)

This service is paid as I need to pay for the servers and infrastructure.

Thanks to everyone who supports this project 🙏

## Why this repository is open-source?

This repository is open-source so the community can audit the code.

There is no need to run this repo yourself, as if you want to access Gladys remotely without using Gladys Plus, you can just setup a VPN to your home network.

## Release process

Docker images are only published from a Git tag, so a release can be rolled back by deploying the previous `vX.Y.Z` image. Everything happens in the GitHub interface:

1. Open the [Prepare release](../../actions/workflows/prepare-release.yml) workflow, click **Run workflow** on `master` and pick the bump type (`patch`, `minor` or `major`). It bumps the version in `package.json` on a `release/vX.Y.Z` branch and links to the pull request to open.
2. Open and merge the release pull request once the checks are green.
3. On merge, the **Create release tag** workflow tags `vX.Y.Z` on `master` and starts the **Release Docker image** workflow, which builds and pushes `gladysassistant/gladys-gateway-server:vX.Y.Z` and `latest` to Docker Hub.

Merging a regular pull request to `master` no longer publishes an image.
