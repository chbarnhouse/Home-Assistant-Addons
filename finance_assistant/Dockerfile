# Use the standard Home Assistant base image based on build args
ARG BUILD_FROM
FROM ${BUILD_FROM} AS builder

# === Build Stage ===
# Install Node.js for building the frontend
RUN apk add --no-cache nodejs npm

# Copy frontend code and build it
WORKDIR /frontend_build
COPY frontend/package*.json ./
# Ensure clean install environment within the container
RUN rm -rf node_modules && rm -f package-lock.json && npm install
COPY frontend/ .
RUN npm run build

# === Runtime Stage ===
# Use the base image again for the runtime stage
ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install Python and required packages
RUN apk add --no-cache python3 py3-pip python3-dev build-base

# Set the working directory in the container
WORKDIR /app

# Create a Python virtual environment
ENV VIRTUAL_ENV=/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Copy Python requirements and install them
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy the application code (backend)
COPY backend/ /app/backend/
COPY rootfs/ /rootfs/

# Copy the built frontend from the 'builder' stage
# Note the trailing slash on the source path to copy contents
COPY --from=builder /frontend_build/build/ /app/static/

# Make run.sh executable
COPY run.sh /
RUN chmod a+x /run.sh

# Command to run when the container starts
CMD [ "/run.sh" ]
