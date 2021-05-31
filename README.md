Tired of pushing to test your .gitlab-ci.yml?

Run gitlab pipelines locally as shell executor or docker executor.

Get rid of all those dev specific shell scripts and make files.

[![build](https://img.shields.io/github/workflow/status/firecow/gitlab-ci-local/build)](https://github.com/firecow/gitlab-ci-local/actions)
[![Known Vulnerabilities](https://snyk.io/test/github/firecow/gitlab-ci-local/badge.svg)](https://snyk.io/test/github/firecow/gitlab-ci-local)
[![npm](https://img.shields.io/npm/v/gitlab-ci-local)](https://npmjs.org/package/gitlab-ci-local)
[![license](https://img.shields.io/github/license/firecow/gitlab-ci-local)](https://npmjs.org/package/gitlab-ci-local)

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=firecow_gitlab-ci-local&metric=alert_status)](https://sonarcloud.io/dashboard?id=firecow_gitlab-ci-local)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=firecow_gitlab-ci-local&metric=sqale_rating)](https://sonarcloud.io/dashboard?id=firecow_gitlab-ci-local)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=firecow_gitlab-ci-local&metric=reliability_rating)](https://sonarcloud.io/dashboard?id=firecow_gitlab-ci-local)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=firecow_gitlab-ci-local&metric=security_rating)](https://sonarcloud.io/dashboard?id=firecow_gitlab-ci-local)

[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=firecow_gitlab-ci-local&metric=coverage)](https://sonarcloud.io/dashboard?id=firecow_gitlab-ci-local)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=firecow_gitlab-ci-local&metric=code_smells)](https://sonarcloud.io/dashboard?id=firecow_gitlab-ci-local)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=firecow_gitlab-ci-local&metric=duplicated_lines_density)](https://sonarcloud.io/dashboard?id=firecow_gitlab-ci-local)

## Table of contents

* [Examples](./examples)
    * [docker-compose-nodejs](./examples/docker-compose-nodejs/README.md)
    * [docker-swarm-php](./examples/docker-swarm-php/README.md)
* [Installation](#installation)
* [Convenience](#convenience)
    * [DotEnv file](#dotenv-file)
    * [Bash alias](#bash-alias)
    * [Tab completion](#tab-completion)
* [Quirks](#quirks)
    * [User Variables](#user-variables)
    * [Decorators](#decorators)
    * [Artifacts](#artifacts)
* [Development](#development)
    * [Scripts](#scripts)
    * [Package binaries](#package-binaries)

## Installation

### NPM

```bash
npm install -g gitlab-ci-local
```

### Linux

Download and put binary in `/usr/local/bin`

```bash
sudo su # must be installed as root, if placed in /usr/local/bin/
curl -L https://github.com/firecow/gitlab-ci-local/releases/latest/download/linux.gz | gunzip -c > /usr/local/bin/gitlab-ci-local
chmod +x /usr/local/bin/gitlab-ci-local
exit
```

Or install it only for the current user

```bash
curl -L https://github.com/firecow/gitlab-ci-local/releases/latest/download/linux.gz | gunzip -c > ~/.local/bin/gitlab-ci-local
chmod +x ~/.local/bin/gitlab-ci-local
```

You'll be able to run `gitlab-ci-local` if the environment variable `$PATH` contains `~/.local/bin/`. If it isn't, please refer to the documentation of your shell to add it. 

### Macos

Download and put binary in `/usr/local/bin`

```bash
sudo su # must be installed as root, if placed in /usr/local/bin/
curl -L https://github.com/firecow/gitlab-ci-local/releases/latest/download/macOS.gz | gunzip -c > /usr/local/bin/gitlab-ci-local
chmod +x /usr/local/bin/gitlab-ci-local
exit
```

### Windows (Git bash)

Install [gitbash](https://git-scm.com/downloads)

Download and put binary in `C:\Program Files\Git\mingw64\bin`

```bash
curl -L https://github.com/firecow/gitlab-ci-local/releases/latest/download/win.gz | gunzip -c > /c/Program\ Files/Git/mingw64/bin/gitlab-ci-local.exe
```

## Convenience

### DotEnv file

Add a `.gitlab-ci-local-env` file to the current working directory

```
# Overrides .gitlab-ci.yml as the default git ci/cd file
FILE=doctor-strange.yml # --file

# Always runs needed jobs, when gitlab-ci-local <job-name> is called
NEEDS=true # --needs
```

All cli options can be assigned default values this way

### Bash alias

```bash
echo "alias gcl='gitlab-ci-local'" >> ~/.bashrc
```

### Tab completion

```bash
gitlab-ci-local --completion >> ~/.bashrc 
```

## Quirks

### User variables

Put a file like this in `$HOME/.gitlab-ci-local/variables.yml`

```yaml
---
project:
  gitlab.com/test-group/test-project.git:
    # Will be type Variable and only available if remote is exact match
    AUTHORIZATION_PASSWORD: djwqiod910321

group:
  gitlab.com/test-group/:
    # Will be type Variable and only available for remotes that include group named 'test-group'
    DOCKER_LOGIN_PASSWORD: dij3213n123n12in3

global:
  # Will be type File, because value is a file path
  KNOWN_HOSTS: '~/.ssh/known_hosts'
```

Variables will now appear in your jobs, if project or group matches git remote, global's are always present

### Decorators

#### The `@Description` decorator

Adds descriptive text to `gitlab-ci-local --list`

```yml
# @Description Install npm packages
npm-install:
  image: node
  artifacts:
    paths:
      - node_modules/
  script:
    - npm install --no-audit
```

![description-decorator](./docs/images/description-decorator.png)

#### The `@Interactive` decorator

```yml
# @Interactive
interactive-shell:
  rules:
    - if: $GITLAB_CI == 'false'
      when: manual
  script:
    - docker run -it debian bash
```

![description-decorator](./docs/images/interactive-decorator.png)

#### The `@InjectSSHAgent` decorator

```yml
# @InjectSSHAgent
need-ssh:
  image: kroniak/ssh-client
  script:
    - ssh-add -L
```

### Artifacts

Shell executor jobs copies artifacts to host/cwd directory

Docker executor copies artifacts to and from .gitlab-ci-local/artifacts

## Development

You need nodejs 14+

### Scripts

```bash
./docker-npm install
npm run build
npm run test
```

![example](./docs/images/example.png)

### Package binaries

```bash
npm run pkg-linux
npm run pkg-win
npm run pkg-macos
npm run pkg-all
```
