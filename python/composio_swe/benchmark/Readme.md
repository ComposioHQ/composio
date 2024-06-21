# README.md

## Installation Instructions

### Docker and Docker Compose
To run the services defined in the `docker-compose.yml`, you need to have Docker and Docker Compose installed on your machine.

#### Installing Docker
1. Visit the Docker official website: [Get Docker](https://docs.docker.com/get-docker/)
2. Choose your operating system and follow the instructions to download and install Docker.

#### Installing Docker Compose
Docker Desktop for Windows and Mac includes Docker Compose as part of the installation, so if you have Docker Desktop, you likely already have Docker Compose.

For Linux users:
follow this link - https://docs.docker.com/compose/install/linux/


### Running the Application
To run the application using Docker Compose, follow these steps:

1. Run the following command to build and start the services defined in the Docker Compose file:
```bash
docker compose up swe-agent --build
```

This command will start all the services defined in your Docker Compose file, including the `swe-agent` service which runs the `run_evaluation.py` script.

### Stopping the Application
To stop all services, you can use the following command:
```bash
docker compose down
```