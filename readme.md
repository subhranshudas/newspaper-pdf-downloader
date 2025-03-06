# Newspaper Slack bot

basic app to scrape and send consolidated PDF to slack channel

## tech stack

- playwright

## make sure to fill up these

```bash
NEWSPAPER_BASE_URL=
SLACK_BOT_TOKEN=
SLACK_CHANNEL_ID=
```

## docker commands (local testing)

### build the docker image

```bash
docker build -t newspaper-pdf-downloader .
```

### run the docker container with .env file

```bash
docker run --env-file .env newspaper-pdf-downloader
```

### check docker image stats

```bash
docker image ls newspaper-pdf-downloader
```

### check docker container stats

```bash
docker container ls -a -s
```
