import base64
import json
import ssl
import urllib.parse
import urllib.request
from urllib.error import HTTPError


class KubernetesClient:
    def __init__(self, cluster: dict, token: str):
        self.endpoint = cluster["endpoint"].rstrip("/")
        ca_data = cluster.get("certificate_authority_data")
        ca_pem = base64.b64decode(ca_data).decode("utf-8") if ca_data else None
        self.context = ssl.create_default_context(cadata=ca_pem) if ca_pem else ssl.create_default_context()
        self.token = token

    def get(self, path: str) -> dict:
        request = urllib.request.Request(
            f"{self.endpoint}{path}",
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, context=self.context, timeout=10) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Kubernetes API {path} failed: HTTP {exc.code}: {body}") from exc


def eks_bearer_token(cluster_name: str, region: str) -> str:
    import boto3
    from botocore.signers import RequestSigner

    session = boto3.session.Session()
    credentials = session.get_credentials()
    service_id = session.client("sts", region_name=region).meta.service_model.service_id
    signer = RequestSigner(service_id, region, "sts", "v4", credentials, session.events)
    params = {
        "method": "GET",
        "url": f"https://sts.{region}.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15",
        "body": {},
        "headers": {"x-k8s-aws-id": cluster_name},
        "context": {},
    }
    signed_url = signer.generate_presigned_url(
        params,
        region_name=region,
        expires_in=60,
        operation_name="",
    )
    token = base64.urlsafe_b64encode(signed_url.encode("utf-8")).decode("utf-8").rstrip("=")
    return f"k8s-aws-v1.{token}"


def cluster_client(config: dict, cluster: dict) -> KubernetesClient:
    region = config.get("aws_region") or _region_from_endpoint(cluster["endpoint"])
    token = eks_bearer_token(cluster["name"], region)
    return KubernetesClient(cluster, token)


def _region_from_endpoint(endpoint: str) -> str:
    host = urllib.parse.urlparse(endpoint).netloc
    parts = host.split(".")
    if len(parts) >= 4 and parts[-3] == "eks":
        return parts[-2]
    return "ap-south-1"
