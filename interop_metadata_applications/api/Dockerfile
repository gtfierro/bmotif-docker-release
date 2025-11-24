FROM python:3.11

# Set environment variables for non-interactive apt installations
ENV DEBIAN_FRONTEND=noninteractive TRANSFORMERS_MODEL="Alibaba-NLP/gte-modernbert-base" HF_HOME=/opt/hf TRANSFORMERS_CACHE=/opt/hf/hub

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive \
    apt-get -y install default-jre-headless curl ca-certificates python3-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# install uv
ADD https://astral.sh/uv/install.sh /uv-installer.sh
RUN sh /uv-installer.sh && rm /uv-installer.sh
ENV PATH="/root/.local/bin/:$PATH"

# Copy project
COPY ./pyproject.toml /opt/
COPY ./point-embeddings.parquet /opt/
COPY ./equip-embeddings.parquet /opt/
COPY ./asbuilt-lib /opt/asbuilt-lib/


# Install dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

WORKDIR /opt/


# Downloading transformers model in a separate layer
RUN uv run python - <<'PY'
import os
from transformers import AutoConfig, AutoTokenizer, AutoModel
model_id = os.environ.get('TRANSFORMERS_MODEL')
cache_dir = os.environ.get('TRANSFORMERS_CACHE')
AutoConfig.from_pretrained(model_id, cache_dir=cache_dir)
AutoTokenizer.from_pretrained(model_id, cache_dir=cache_dir)
AutoModel.from_pretrained(model_id, cache_dir=cache_dir)
print('Downloaded:', model_id)
PY

ADD  ./interop_metadata_applications /opt/interop_metadata_applications

CMD uv run flask --app interop_metadata_applications/api run --host 0.0.0.0 -p 5000 --without-threads
