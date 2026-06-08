# 트러블슈팅

상태: source of truth
기준일: 2026-06-08
원본: `/home/vicbear/Aegis/safe-edge/troubleshooting.md`

## 목적

`factory-a` / Safe-Edge 구축과 검증 과정에서 실제로 겪은 문제를 번호 기반으로 정리한다.

## 사용 형식

각 항목은 아래 형식을 따른다. 날짜가 확인 가능한 항목은 `날짜`를 함께 기록한다.

```text
날짜
증상/상황
원인
확인 명령
해결/판단
재발 방지/주의
```

## 1. SSH host key 변경 경고

날짜: 2026-04-27


증상

세 노드에 SSH 접속을 시도했을 때 다음 경고가 발생했다.

```text
WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!
Host key verification failed.
```

대상 IP:

- `10.10.10.10`
- `10.10.10.11`
- `10.10.10.12`

원인

같은 IP에 대해 기존에 저장된 SSH host key와 현재 Raspberry Pi의 SSH host key가 달랐다.
새 OS 설치 또는 IP 재사용으로 인해 발생한 것으로 판단했다.

조치

사용자가 세 IP가 현재 작업 대상 장비가 맞다고 확인했다.
그 후 기존 `known_hosts` 항목을 제거했다.

```bash
ssh-keygen -f /home/vicbear/.ssh/known_hosts -R 10.10.10.10
ssh-keygen -f /home/vicbear/.ssh/known_hosts -R 10.10.10.11
ssh-keygen -f /home/vicbear/.ssh/known_hosts -R 10.10.10.12
```

이후 새 host key를 수락하고 SSH 접속을 다시 진행했다.


## 2. SSH 인증 실패

날짜: 2026-04-27


증상

새 host key 등록 후 SSH 접속 시 다음 오류가 발생했다.

```text
Permission denied (publickey,password).
```

원인

현재 노드는 비밀번호 방식 SSH를 사용하고 있으며, 자동 명령 실행 시 비밀번호를 입력하지 못해 인증에 실패했다.

조치

사용자가 세 노드의 SSH 비밀번호를 세션에서 제공했다.
비밀번호는 문서에 저장하지 않고, 해당 세션의 SSH 실행에만 사용했다.


## 3. `sshpass`, `expect` 없음

날짜: 2026-04-27


증상

비밀번호 자동 입력을 위해 `sshpass`, `expect` 존재 여부를 확인했으나 둘 다 설치되어 있지 않았다.

```bash
command -v sshpass
command -v expect
```

원인

현재 Host PC 환경에 비대화형 비밀번호 입력 도구가 설치되어 있지 않았다.

조치

새 패키지를 설치하지 않고, TTY SSH 세션을 열어 세션 내에서만 비밀번호를 입력했다.


## 4. `dphys-swapfile.service` 없음

날짜: 2026-04-27


증상

swap 비활성화 과정에서 다음 메시지가 출력됐다.

```text
Failed to disable unit: Unit dphys-swapfile.service does not exist
```

원인

현재 OS에는 `dphys-swapfile` 서비스가 설치되어 있지 않았다.

조치

명령은 `|| true`로 처리했으므로 작업을 계속했다.
이후 `free -h`로 세 노드 모두 Swap이 `0B`임을 확인했고, `/etc/fstab`에 활성 swap 항목이 없는 것도 확인했다.


## 5. cgroup 설정 확인 중 `/proc/cmdline`에 `cgroup_disable=memory` 표시

날짜: 2026-04-27


증상

세 노드의 `/proc/cmdline`에 다음 값이 있었다.

```text
cgroup_disable=memory
```

K3s 실행을 위해 memory cgroup 설정이 필요하므로 수정이 필요했다.

조치

세 노드의 `/boot/firmware/cmdline.txt`를 백업한 뒤 다음 값을 추가했다.

```text
cgroup_enable=cpuset cgroup_memory=1 cgroup_enable=memory
```

그리고 세 노드를 재부팅했다.

추가 확인

재부팅 후에도 `/proc/cmdline`에는 기존 `cgroup_disable=memory` 문자열이 보였다.
하지만 실제 cgroup v2 controller 상태를 확인했을 때 세 노드 모두 `memory` controller가 활성화되어 있었다.

```bash
cat /sys/fs/cgroup/cgroup.controllers
```

확인 결과:

```text
cpuset cpu io memory pids
```

따라서 K3s 실행에 필요한 memory controller는 활성화된 것으로 판단했다.


## 6. git 저장소 아님

날짜: 2026-04-27


증상

`guide.md` 변경 내역을 `git diff`로 확인하려 했으나 다음 오류가 발생했다.

```text
warning: Not a git repository. Use --no-index to compare two paths outside a working tree
```

원인

현재 `/home/vicbear/Aegis` 디렉터리는 git 저장소가 아니다.

조치

git 기반 diff 확인은 생략했다.
필요하면 이후 별도 백업 파일 또는 수동 diff 방식으로 변경 내역을 비교한다.


## 7. I2C 장치 파일 없음

날짜: 2026-04-27


증상

`worker1`, `worker2`에서 BME280 확인을 위해 `/dev/i2c-1`을 확인했으나 장치 파일이 없었다.

```text
ls: cannot access '/dev/i2c-1': No such file or directory
Error: Could not open file `/dev/i2c-1' or `/dev/i2c/1': No such file or directory
```

확인

두 워커의 `/boot/firmware/config.txt`에서 I2C 설정이 주석 처리되어 있었다.

```text
#dtparam=i2c_arm=on
```

조치

`worker1`, `worker2`에서 `/boot/firmware/config.txt`를 백업한 뒤 I2C 설정을 활성화했다.

```bash
sudo cp /boot/firmware/config.txt /boot/firmware/config.txt.bak-i2c
sudo sed -i 's/^#dtparam=i2c_arm=on/dtparam=i2c_arm=on/' /boot/firmware/config.txt
sudo reboot
```

남은 상태

재부팅 후 `worker1`에서 다시 확인했지만 `/dev/i2c-1`이 여전히 생성되지 않았다.
I2C는 하드웨어 배선, HAT/센서 연결, 펌웨어 overlay, 커널 모듈 상태의 영향을 받으므로 사용자가 장비에서 직접 테스트하기로 했다.

최종 확인

사용자가 `worker1`, `worker2`에서 직접 `i2cdetect -y 1`을 실행했고 두 노드 모두 주소 `0x76`이 확인됐다.

```text
70: -- -- -- -- -- -- 76 --
```

따라서 BME280 I2C 인식 문제는 해결된 것으로 기록한다.


## 8. K3s 설치 중 `curl | sudo -S` 비밀번호 입력 실패

날짜: 2026-04-27


증상

처음 `master`에 K3s server를 설치할 때 `curl | sudo -S ... sh -` 형태로 실행했으나 sudo 비밀번호 입력이 실패했다.

```text
sudo: 3 incorrect password attempts
```

원인

파이프라인에서 `sudo`의 표준입력이 설치 스크립트 스트림으로 연결되어 비밀번호 입력을 정상적으로 받지 못했다.

조치

원격 SSH 세션을 연 뒤 먼저 `sudo -v`로 sudo 권한을 갱신했다.
그 다음 같은 세션에서 `curl -sfL https://get.k3s.io | sudo env ... sh -` 명령을 실행했다.


## 9. K3s master INTERNAL-IP가 Wi-Fi 대역으로 잡힘

날짜: 2026-04-27


증상

처음 K3s server 설치 후 `kubectl get nodes -o wide`에서 `master`의 `INTERNAL-IP`가 독립망 IP가 아닌 `192.168.0.45`로 표시됐다.

```text
master Ready control-plane 192.168.0.45
```

원인

K3s가 노드의 기본 네트워크 인터페이스를 자동 선택하면서 Wi-Fi 또는 외부망 IP를 선택했다.
Safe-Edge 클러스터는 `10.10.10.x` 독립망을 기준으로 하므로 worker join 전에 보정이 필요했다.

조치

K3s 설치 스크립트를 재실행해 server 실행 인자에 독립망 IP를 명시했다.

```bash
INSTALL_K3S_EXEC='server --node-name master --node-ip 10.10.10.10 --advertise-address 10.10.10.10 --write-kubeconfig-mode 644'
```

재확인 결과 `master`의 `INTERNAL-IP`가 `10.10.10.10`으로 보정됐다.

worker join 시에도 같은 문제를 방지하기 위해 각 노드의 독립망 IP를 명시했다.

```bash
worker1: --node-ip 10.10.10.11
worker2: --node-ip 10.10.10.12
```


## 10. K3s 설치 중 iptables 도구 경고

날짜: 2026-04-27


증상

K3s 설치 중 다음 경고가 출력됐다.

```text
Host iptables-save/iptables-restore tools not found
Host ip6tables-save/ip6tables-restore tools not found
```

영향

설치 자체는 완료됐고, 세 노드 모두 `Ready` 상태로 join됐다.
현재는 경고로 기록만 남긴다.

후속 확인

이후 네트워크 정책, Service, Pod 통신, CNI 동작에 문제가 발생하면 `iptables` 패키지 설치 여부를 우선 확인한다.


## 11. Longhorn 데이터 경로 없음

날짜: 2026-04-27


증상

Longhorn 사전 조건 확인 중 세 노드 모두 `/var/lib/longhorn` 경로가 없었다.

```text
df: /var/lib/longhorn: No such file or directory
```

원인

Longhorn 설치 전 기본 데이터 경로가 아직 생성되지 않았다.

조치

세 노드에 경로를 생성했다.

```bash
sudo mkdir -p /var/lib/longhorn
```

이후 `df -h /var/lib/longhorn`으로 세 노드 모두 `/dev/sda2`의 약 117G 디스크를 사용하는 것을 확인했다.


## 12. Longhorn 적용 중 CRD 경고

날짜: 2026-04-27


증상

Longhorn manifest 적용 중 다음 경고가 출력됐다.

```text
Warning: unrecognized format "int64"
```

영향

CRD와 Longhorn 리소스는 생성됐고, 최종적으로 Pod와 StorageClass도 정상 상태가 됐다.
현재는 설치 중 경고로 기록만 남긴다.


## 13. Longhorn manager가 master에 배치되지 않음

날짜: 2026-04-27


증상

Longhorn 설치 직후 `longhorn-manager` DaemonSet의 desired 수가 2였고, Longhorn Node 목록에는 `worker1`, `worker2`만 보였다.

```text
longhorn-manager DESIRED=2
Longhorn Node: worker1, worker2
```

원인

`master`에는 `NoSchedule` taint가 적용되어 있었고, Longhorn manager DaemonSet에는 해당 taint에 대한 toleration이 없었다.

조치

Longhorn의 `taint-toleration` 설정을 보완했다.

```bash
kubectl -n longhorn-system patch settings.longhorn.io taint-toleration --type=merge \
  -p '{"value":"node-role.kubernetes.io/control-plane=true:NoSchedule;node-role.kubernetes.io/master=true:NoSchedule"}'
```

그리고 `longhorn-manager` DaemonSet에도 master taint toleration을 명시적으로 추가했다.

```bash
kubectl -n longhorn-system patch daemonset longhorn-manager --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/tolerations","value":[{"key":"node-role.kubernetes.io/control-plane","operator":"Equal","value":"true","effect":"NoSchedule"},{"key":"node-role.kubernetes.io/master","operator":"Equal","value":"true","effect":"NoSchedule"}]}]'
```

결과

`longhorn-manager`가 세 노드에 배치됐고 Longhorn Node 목록에 `master`, `worker1`, `worker2`가 모두 표시됐다.


## 14. Longhorn KernelModulesLoaded 조건 False

날짜: 2026-04-27


증상

Longhorn Node 조건에서 `KernelModulesLoaded=False`가 표시됐다.

```text
Kernel modules [dm_crypt] are not loaded
```

원인

Longhorn이 요구하는 `dm_crypt` 커널 모듈이 초기 확인 시 로드되어 있지 않았다.

조치

세 노드에서 `dm_crypt`를 로드하고 부팅 시 자동 로드되도록 설정했다.

```bash
sudo modprobe dm_crypt
echo dm_crypt | sudo tee /etc/modules-load.d/longhorn.conf
```

이후 `longhorn-manager` DaemonSet을 재시작해 Longhorn이 상태를 다시 평가하게 했다.

```bash
kubectl -n longhorn-system rollout restart ds/longhorn-manager
kubectl -n longhorn-system rollout status ds/longhorn-manager --timeout=180s
```

결과

최종 확인에서 세 노드 모두 `KernelModulesLoaded=True`가 됐다.


## 15. MetalLB 설치 보류와 K3s ServiceLB 사용

날짜: 2026-04-27


상황

외부 접속 기반 설정 단계에서 MetalLB 설치를 검토했다.
확인 결과 K3s 기본 ServiceLB가 이미 활성화되어 있었고, Traefik Service가 `LoadBalancer`로 외부 노출 중이었다.

```text
traefik LoadBalancer external IP:
10.10.10.10, 10.10.10.11, 10.10.10.12
```

판단

현재 상태에서 MetalLB를 추가 설치하면 K3s ServiceLB와 LoadBalancer 처리 역할이 겹칠 수 있다.
MetalLB로 전환하려면 K3s ServiceLB 비활성화 계획을 먼저 세워야 한다.

조치

현재 단계에서는 MetalLB를 설치하지 않고 K3s 기본 ServiceLB를 사용하기로 했다.
MetalLB 후보 IP로 `10.10.10.200`부터 `10.10.10.205`까지 ping 확인을 수행했고 모두 응답 없음 상태였다.


## 16. Longhorn UI LoadBalancer 노출

날짜: 2026-04-27


상황

Longhorn UI는 기본적으로 `ClusterIP` Service인 `longhorn-frontend`로만 존재했다.

```text
longhorn-frontend ClusterIP 80/TCP
```

조치

내부망에서 접속할 수 있도록 별도 LoadBalancer Service를 생성했다.

```bash
kubectl -n longhorn-system expose service longhorn-frontend \
  --type=LoadBalancer \
  --name=longhorn-frontend-lb \
  --port=8080 \
  --target-port=http
```

결과

K3s ServiceLB가 `worker1`, `worker2` IP로 서비스를 노출했다.

```text
longhorn-frontend-lb LoadBalancer
external IP: 10.10.10.11, 10.10.10.12
port: 8080
```

Host PC에서 다음 접속을 확인했다.

```text
http://10.10.10.11:8080 -> HTTP/1.1 200 OK
http://10.10.10.12:8080 -> HTTP/1.1 200 OK
```

`http://10.10.10.10:8080`은 접속되지 않았다.
master에는 `NoSchedule` taint가 있고, ServiceLB 대상에서 제외된 것으로 판단했다.

주의

Longhorn UI는 별도 인증 없이 노출될 수 있으므로 인터넷 공개용으로 사용하면 안 된다.
현재 구성은 내부 독립망 접속용으로만 취급한다.


## 17. K3s ServiceLB에서 MetalLB로 전환

날짜: 2026-04-27


상황

초기 7단계에서는 K3s 기본 ServiceLB로 Longhorn UI를 임시 노출했다.
이후 사용자가 포트 기반 접속 대신 서비스별 고정 IP 기반 접속을 원한다고 정리했고, MetalLB를 사용하기로 했다.

원인

K3s ServiceLB와 MetalLB는 모두 `LoadBalancer` Service의 외부 IP 할당을 담당할 수 있다.
두 방식을 동시에 쓰면 같은 Service에 대해 외부 노출 처리가 겹칠 수 있으므로 하나로 정리해야 했다.

조치

K3s 서버 설정에 `--disable servicelb`를 추가해 ServiceLB를 비활성화했다.

```bash
curl -sfL https://get.k3s.io | sudo env INSTALL_K3S_EXEC='server --node-name master --node-ip 10.10.10.10 --advertise-address 10.10.10.10 --write-kubeconfig-mode 644 --disable servicelb' sh -
```

이후 MetalLB v0.15.3 manifest를 적용하고 `IPAddressPool`, `L2Advertisement`를 생성했다.

```text
MetalLB pool: 10.10.10.201-10.10.10.250
Reserved IP: 10.10.10.200 Argo CD
```

사용자가 지정한 사용 가능 범위는 `10.10.10.200-10.10.10.250`이지만, `.200`은 Argo CD 예약 IP라 실제 pool에서는 제외했다.

결과

MetalLB controller와 speaker가 정상 실행됐다.

```text
controller: Running
speaker: master, worker1, worker2에서 Running
```


## 18. Longhorn LoadBalancer Service 삭제 지연

날짜: 2026-04-27


증상

K3s ServiceLB로 만들었던 `longhorn-frontend-lb` Service를 삭제한 뒤 바로 재생성하려 했으나 같은 이름의 Service가 남아 있어 작업이 지연됐다.

원인

기존 Service에 `service.kubernetes.io/load-balancer-cleanup` finalizer가 남아 있었다.
ServiceLB 전환 과정에서 cleanup finalizer가 삭제 완료를 막고 있었다.

조치

기존 Service의 finalizer를 제거한 뒤 삭제와 재생성을 진행했다.

```bash
kubectl -n longhorn-system patch svc longhorn-frontend-lb --type=merge -p '{"metadata":{"finalizers":null}}'
```

결과

`longhorn-frontend-lb` Service를 MetalLB용 LoadBalancer Service로 다시 구성할 수 있었다.


## 19. MetalLB IP 충돌과 어노테이션 충돌

날짜: 2026-04-27


증상

Longhorn UI를 `10.10.10.201`로 고정하려 했으나 MetalLB 할당이 실패했다.

```text
address also in use by kube-system/traefik
service can not have both metallb.io/loadBalancerIPs and svc.Spec.LoadBalancerIP
```

원인

MetalLB 설치 직후 Traefik이 pool의 첫 IP인 `10.10.10.201`을 자동으로 할당받았다.
동시에 Longhorn Service에는 새 MetalLB 어노테이션, 예전 MetalLB 어노테이션, `spec.loadBalancerIP`가 함께 설정되어 MetalLB가 거부했다.

조치

Traefik은 `10.10.10.202`로 고정했다.
Longhorn Service에서는 deprecated 어노테이션과 `spec.loadBalancerIP`를 제거하고, 현재 MetalLB 어노테이션만 남겼다.

```bash
kubectl -n kube-system annotate svc traefik metallb.io/loadBalancerIPs=10.10.10.202 --overwrite
kubectl -n longhorn-system annotate svc longhorn-frontend-lb metallb.universe.tf/loadBalancerIPs-
kubectl -n longhorn-system patch svc longhorn-frontend-lb --type=json -p='[{"op":"remove","path":"/spec/loadBalancerIP"}]'
kubectl -n longhorn-system annotate svc longhorn-frontend-lb metallb.io/loadBalancerIPs=10.10.10.201 --overwrite
```

결과

Longhorn UI는 `10.10.10.201`을 정상 할당받았고 HTTP 200 응답을 반환했다.
Traefik은 `10.10.10.202`를 정상 할당받았고, 현재 Ingress 리소스가 없어 HTTP 404를 반환했다.

```text
longhorn-system/longhorn-frontend-lb -> 10.10.10.201 -> HTTP/1.1 200 OK
kube-system/traefik                 -> 10.10.10.202 -> HTTP/1.1 404 Not Found
```


## 20. Argo CD Helm 설치 중 kubeconfig 미지정

날짜: 2026-04-27


증상

Argo CD를 Helm으로 설치할 때 첫 실행에서 Helm이 Kubernetes API에 접속하지 못했다.

```text
Error: Kubernetes cluster unreachable: Get "http://localhost:8080/version": dial tcp [::1]:8080: connect: connection refused
```

원인

`kubectl`은 K3s 환경에서 동작했지만, Helm은 사용할 kubeconfig를 찾지 못해 기본 주소인 `localhost:8080`으로 접속하려 했다.

조치

`master`에서 K3s kubeconfig를 명시했다.

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

이후 같은 Helm 설치 명령을 재실행했다.

결과

Argo CD Helm release가 정상 설치됐다.

```text
release: argocd
namespace: argocd
status: deployed
```

`argocd-server`는 MetalLB 고정 IP `10.10.10.200`을 할당받았고, HTTP 200 응답을 반환했다.

```text
http://10.10.10.200 -> HTTP/1.1 200 OK
```


## 21. GitHub push 중 DNS 해석 실패

날짜: 2026-04-27


증상

로컬 `safe-edge-config-main` 저장소를 GitHub 원격 저장소로 push할 때 첫 시도에서 DNS 해석에 실패했다.

```text
fatal: unable to access 'https://github.com/aegis-pi/safe-edge-config-main.git/': Could not resolve host: github.com
```

원인

현재 작업 환경의 기본 샌드박스에서는 외부 네트워크 접근이 제한되어 있어 `github.com`을 해석하지 못했다.

조치

동일한 `git push -u origin main` 명령을 외부 네트워크 권한으로 다시 실행했다.

결과

GitHub 원격 저장소에 첫 커밋 push가 완료됐다.

```text
repository: https://github.com/aegis-pi/safe-edge-config-main.git
branch: main
commit: 9914469 Initial safe-edge config
```


## 22. 원격 비대화형 SSH에서 `i2cdetect` 명령 PATH 누락

날짜: 2026-04-27


증상

`master`에서 `worker2`의 I2C 상태를 원격 확인할 때 다음 메시지가 출력됐다.

```text
bash: line 1: i2cdetect: command not found
```

원인

`i2cdetect`는 `/usr/sbin/i2cdetect`에 설치되어 있었지만, 원격 비대화형 SSH shell의 PATH에 `/usr/sbin`이 포함되지 않아 명령을 찾지 못했다.

조치

절대 경로로 다시 실행했다.

```bash
/usr/sbin/i2cdetect -y 1
```

결과

`worker2`에서 BME280 주소 `0x76`이 확인됐다.

```text
70: -- -- -- -- -- -- 76 --
```


## 23. monitoring 배포 직후 BME280 초기 재시작

날짜: 2026-04-27


증상

Argo CD로 `safe-edge-monitoring`을 sync한 직후 `bme280-sensor` Pod가 몇 차례 재시작했다.

```text
bme280-sensor: Restart Count 증가
Back-off restarting failed container bme280
```

확인

동시에 InfluxDB PVC 생성, 볼륨 attach, InfluxDB 이미지 pull 및 초기화가 진행 중이었다.
잠시 후 InfluxDB가 Running이 되고 BME280 Pod도 Running 상태가 됐다.

결과

BME280가 InfluxDB에 연결했고 센서 측정 로그가 정상 출력됐다.

```text
Connected to InfluxDB (safe_edge_db) successfully.
BME280 sensor measurement started.
Temp/Humidity/Pressure 수집 로그 확인
```

InfluxDB 로그에서도 `safe_edge_db` 생성과 write 요청이 확인됐다.


## 24. ai-apps 배포 직후 Integrated AI 초기 InfluxDB timeout

날짜: 2026-04-27


증상

Argo CD로 `safe-edge-ai-apps`를 sync한 뒤 `safe-edge-integrated-ai`가 한 번 종료됐다.

```text
influxdb.exceptions.InfluxDBServerError: {"error":"timeout"}
```

확인

Integrated AI는 카메라 연결과 모델 로딩에는 성공했다.

```text
InfluxDB (safe_edge_db) 연결 성공
카메라 연결 및 설정 완료
실시간 통합 감시 시작
```

이후 InfluxDB write 중 timeout으로 종료됐고 Kubernetes가 컨테이너를 재시작했다.

결과

재시작 후 `safe-edge-integrated-ai` Pod는 Running 상태가 됐고 감시 로그가 계속 출력됐다.

```text
safe-edge-integrated-ai: Running, restart 1
AI STATUS 로그 출력
```

현재는 반복적인 치명 오류는 확인되지 않았다.


## 25. ai-apps 배포 중 대용량 이미지 pull 지연

날짜: 2026-04-27


증상

`safe-edge-ai:v6`와 `safe-edge-audio:v2` 이미지 pull 시간이 길었다.

```text
safe-edge-ai:v6: 약 3분 22초
safe-edge-audio:v2: 약 5분 34초
```

원인

이미지 크기가 컸다.

```text
safe-edge-ai:v6: 약 778MB
safe-edge-audio:v2: 약 981MB
```

결과

두 이미지 모두 pull이 완료됐고 최종 Pod 상태는 Running이다.

```text
safe-edge-integrated-ai: Running
safe-edge-audio: Running
```


## 26. Audio 앱 ALSA/JACK 경고

날짜: 2026-04-27


증상

`safe-edge-audio` 로그에 ALSA와 JACK 관련 경고가 출력됐다.

```text
Unknown PCM ...
jack server is not running or cannot be started
paInvalidSampleRate
```

확인

경고 이후에도 앱은 USB 오디오 장치를 인식했다.

```text
Monitoring device connected: AB13X USB Audio: - (hw:0,0)
Abnormal noise monitoring system running
Waiting for acoustic events...
```

결과

현재 `safe-edge-audio` Pod는 Running 상태다.
경고는 기록만 남기고, 실제 음향 이벤트 감지 실패나 반복 재시작이 발생하면 오디오 sample rate와 ALSA 장치 설정을 추가로 확인한다.


## 27. Grafana IP와 Traefik IP 충돌 예방

날짜: 2026-04-27


상황

Grafana 접속 IP를 `10.10.10.202`로 사용하기로 했지만, 기존 Traefik LoadBalancer가 같은 IP를 사용 중이었다.

조치

Traefik을 사용하지 않는 IP인 `10.10.10.203`으로 변경했다.

```bash
kubectl -n kube-system annotate svc traefik metallb.io/loadBalancerIPs=10.10.10.203 --overwrite
kubectl -n kube-system get svc traefik -o wide
```

결과

```text
kube-system/traefik -> 10.10.10.203
Grafana 예정 IP -> 10.10.10.202
```

이후 Grafana는 `10.10.10.202`를 사용한다.


## 28. Grafana PVC 권한 문제

날짜: 2026-04-27


증상

Grafana Pod가 생성됐지만 Service endpoint가 비어 있었고, 로그에 `/var/lib/grafana` 쓰기 권한 오류가 출력됐다.

```text
GF_PATHS_DATA='/var/lib/grafana' is not writable.
mkdir: can't create directory '/var/lib/grafana/plugins': Permission denied
```

원인

Grafana 컨테이너가 Longhorn PVC에 쓰기 위한 UID/GID 권한이 맞지 않았다.

조치

`monitoring/grafana.yaml`의 Pod spec에 Grafana 컨테이너 기본 UID/GID인 `472` 기준 securityContext를 추가했다.

```yaml
securityContext:
  fsGroup: 472
  runAsUser: 472
  runAsGroup: 472
```

결과

Grafana Pod가 새 ReplicaSet으로 재생성됐고 정상 Running 상태가 됐다.

```text
grafana Pod: 1/1 Running
grafana-pvc: Bound
grafana-svc: 10.10.10.202
HTTP: 302 /login
```

첫 부팅에서는 Grafana DB migration과 기본 플러그인 설치가 몇 분 걸릴 수 있다.


## 29. InfluxDB retention policy 1일 설정 중 shard duration 오류

날짜: 2026-04-27


증상

`safe_edge_db`의 `autogen` retention policy를 1일로 변경하려고 했을 때 다음 오류가 발생했다.

```text
retention policy duration must be greater than the shard duration
```

원인

기존 `autogen`의 shard group duration이 `168h0m0s`였고, retention duration을 `1d`로 줄이려면 shard duration도 retention duration보다 작게 조정해야 했다.

조치

Retention duration과 shard duration을 함께 지정했다.

```bash
curl -G 'http://10.10.10.11:30086/query' \
  --data-urlencode 'q=ALTER RETENTION POLICY autogen ON safe_edge_db DURATION 1d REPLICATION 1 SHARD DURATION 1h DEFAULT'
```

결과

```text
autogen duration: 24h0m0s
autogen shardGroupDuration: 1h0m0s
default: true
```


## 30. Kubernetes CronJob 기반 Failback 재생성 루프 위험

날짜: 2026-04-28


상황

`worker2` 복구 후 하드웨어 의존 Pod를 자동으로 `worker2`로 돌리기 위해 Kubernetes CronJob을 사용한 적이 있었다.

문제

`worker2`가 Kubernetes Node 관점에서는 Ready여도 하드웨어 장치가 안정적이지 않으면, BME280/Audio/AI Pod가 `worker2`로 올라간 뒤 계속 재생성될 수 있다.

특히 다음 조건을 확인하지 않고 Pod를 삭제하면 정상 동작 중인 Pod까지 죽일 수 있다.

```text
worker2에 이미 같은 app의 Pod가 있는지
마지막 Failback 이후 cooldown이 지났는지
```

방침

Failback은 Kubernetes CronJob이 아니라 master OS cron 기반 Kubernetes-only 외부 스크립트로 처리한다.

스크립트는 worker2 SSH나 비밀번호를 사용하지 않는다. 하드웨어 직접 확인은 하지 않고, Kubernetes API 기준으로 `worker2`에 대상 Pod가 이미 있는지와 `worker1`에 남은 대상 Pod가 있는지를 판단한다.

스크립트는 반드시 다음을 최우선으로 확인한다.

```text
worker2에 대상 app Pod가 이미 있으면 아무 작업도 하지 않는다.
worker1에 남아 있는 대상 Pod만 삭제 후보로 본다.
```

대상

```text
Failback 대상:
- monitoring/bme280-sensor
- ai-apps/safe-edge-integrated-ai
- ai-apps/safe-edge-audio

Failback 제외:
- monitoring/influxdb
- monitoring/prometheus
- monitoring/grafana
- node-exporter
- kube-state-metrics
- argocd
- longhorn-system
```

실제 테스트에서 확인한 동작

2026-04-28 실제 장애 테스트에서는 `worker2`의 `k3s-agent`를 중지해 Node를 `NotReady`로 만들었다.

확인 결과:

```text
tolerationSeconds=30 이후 대상 Pod가 worker1로 재스케줄됐다.
bme280-sensor는 worker1에서 센서 로그를 출력했다.
safe-edge-integrated-ai는 worker1에서 카메라 등록과 AI STATUS 로그를 출력했다.
safe-edge-audio는 worker1에서 이미지 pull 이후 Running이 됐다.
```

주의할 점:

```text
safe-edge-audio 이미지는 worker1에서 약 4분 28초 pull 시간이 걸렸다.
이미지가 사전에 준비되지 않은 노드는 RTO가 이미지 pull 시간에 크게 영향받는다.
운영 전 worker1/worker2 양쪽에 AI/Audio 이미지를 미리 pull해두는 것이 좋다.
```

적용한 개선:

```text
ai-apps Helm chart에 safe-edge-image-prepull DaemonSet을 추가한다.
DaemonSet은 worker1/worker2에서만 실행한다.
initContainer가 safe-edge-ai, safe-edge-audio 이미지를 미리 pull한다.
AI/Audio 앱은 imagePullPolicy IfNotPresent를 사용한다.
```

이미지가 최신으로 갱신되지 않는 경우:

```text
같은 태그를 덮어쓴 이미지는 IfNotPresent 상태에서 노드 캐시가 우선될 수 있다.
운영 이미지는 같은 태그를 재사용하지 말고 새 태그로 배포한다.
values.yaml의 이미지 태그를 변경한 뒤 Git push와 Argo CD sync를 진행한다.
```


## 31. 하드웨어 의존 Pod는 RollingUpdate로 갱신하지 않는다

날짜: 2026-04-27


상황

`safe-edge-integrated-ai`, `safe-edge-audio`, `bme280-sensor`는 노드의 실제 장치를 직접 잡는다.

```text
safe-edge-integrated-ai: /dev, /run/udev, camera 계열 장치
safe-edge-audio: /dev/snd
bme280-sensor: /dev/i2c-1
```

문제

Deployment 기본 전략인 `RollingUpdate`는 새 Pod를 먼저 만들고 기존 Pod를 나중에 종료한다. 이 방식은 무중단 웹 서비스에는 적합하지만, 하드웨어 장치를 잡는 Pod에는 맞지 않는다.

새 Pod와 기존 Pod가 짧은 시간이라도 동시에 뜨면 다음 문제가 생길 수 있다.

```text
동일 카메라 또는 오디오 장치를 두 프로세스가 동시에 열려고 시도
/dev/snd 또는 /dev/i2c-1 접근 충돌
센서/오디오 초기화 실패
장치 점유 상태가 꼬여 Pod 재시작 반복
```

조치

하드웨어 의존 Pod는 모두 `Recreate` 전략으로 둔다. `Recreate`는 기존 Pod를 먼저 종료한 뒤 새 Pod를 생성하므로 같은 장치를 동시에 잡는 시간을 만들지 않는다.

현재 적용 기준:

```text
ai-apps/safe-edge-integrated-ai: strategy Recreate
ai-apps/safe-edge-audio: strategy Recreate
monitoring/bme280-sensor: strategy Recreate
```

확인:

```bash
kubectl -n ai-apps get deploy safe-edge-integrated-ai safe-edge-audio \
  -o jsonpath='{range .items[*]}{.metadata.name}{" strategy="}{.spec.strategy.type}{"\n"}{end}'
kubectl -n monitoring get deploy bme280-sensor \
  -o jsonpath='{.metadata.name}{" strategy="}{.spec.strategy.type}{"\n"}'
```

정상 출력:

```text
safe-edge-integrated-ai strategy=Recreate
safe-edge-audio strategy=Recreate
bme280-sensor strategy=Recreate
```


## 32. Longhorn RWO PVC와 agent/network 장애에서 AI failover가 막히는 경우

날짜: 2026-04-29


현상

`worker2`의 `k3s-agent`를 중지하거나 랜선을 제거하면 `bme280-sensor`와 `safe-edge-audio`는 `worker1`로 이동하지만, `safe-edge-integrated-ai`는 `ContainerCreating`에 머물 수 있다.

대표 이벤트:

```text
FailedAttachVolume
Multi-Attach error for volume "pvc-83fe5615-2605-4cdd-82ba-c93d698e8b03"
Volume is already used by pod(s) safe-edge-integrated-ai-...
```

원인

`safe-edge-integrated-ai`는 Longhorn RWO PVC `safe-edge-ai-snapshots`를 `/app/snapshots`에 마운트한다. Kubernetes에서 `worker2`가 `NotReady`가 되어도 실제 `worker2`의 OS, containerd, 기존 AI 컨테이너, volume attachment가 즉시 사라진다고 보장할 수 없다.

Longhorn은 RWO volume에 두 writer가 붙는 것을 막기 위해 worker1 attach를 거부한다. 이 동작은 데이터 손상을 막기 위한 정상 방어다.

현재 대응

2026-04-29 `test_07` 이후 현재 운영 구성에서는 AI snapshot Longhorn RWO PVC를 제거했다.

```text
/app/snapshots -> hostPath /var/lib/safe-edge/snapshots
ai-apps PVC: 없음
worker2 safe-edge-agent-watchdog: 제거
```

AI 추론 결과는 기존처럼 InfluxDB에 기록되며, InfluxDB PVC를 통해 Longhorn에 저장된다. Snapshot 이미지는 각 노드 local path에 임시 저장하고, 장기 보관은 후속 비동기 전송 계층에서 처리한다.

기존 PVC 방식의 한계

watchdog reboot는 `worker2`의 stale writer를 제거하고 자기 복구를 빠르게 만드는 데 효과가 있다. 다만 `worker2`가 빠르게 복귀하면 AI가 `worker1`에서 장기 Running으로 안정화되기 전에 다시 `worker2`로 failback될 수 있다.

`test_06`에서 `worker2`를 reboot한 뒤 master API 접근을 계속 차단해 장기 격리 상태를 만들었지만, AI는 자동으로 `worker1`에서 Running이 되지 않았다. `VolumeAttachment`가 여전히 `worker2 attached=true`로 남고, 기존 `worker2` AI Pod 객체가 `Terminating` 상태로 남아 RWO PVC attach를 막았다.

이 상태에서 기존 `worker2` AI Pod 객체를 강제 삭제하자 AI는 `worker1`에서 `2/2 Running`이 됐고, Longhorn 볼륨도 `worker1`에 attach됐다. 따라서 이 문제는 worker1 CPU/메모리 부족이 아니라 stale Pod/VolumeAttachment 정리 문제다.

따라서 다음을 구분한다.

```text
self-healing fencing: worker2를 재부팅해 빠르게 worker2로 복구
long failover fencing: worker2를 전원 차단 또는 외부 power fencing으로 확실히 격리해 worker1에서 장기 운영
```

장기 `worker1` failover까지 자동화하려면 전원 차단 테스트 또는 외부 power fencing이 필요하다. fencing으로 기존 writer가 죽었다는 것을 보장한 뒤에만 stale Pod/VolumeAttachment 정리를 수행한다. `force detach`나 stale Pod 강제 삭제는 기존 writer가 살아 있으면 데이터 손상 위험이 있으므로 무조건 자동화하지 않는다.

운영 판단 기준:

```text
worker2가 NotReady이고 AI가 worker1 ContainerCreating
Longhorn AI PVC가 attaching/unknown
VolumeAttachment가 worker2 attached=true
기존 worker2 AI Pod가 Terminating 또는 Longhorn workload status에서 Running으로 남음
```

이 경우 먼저 실제 worker2의 전원/OS/containerd/AI 컨테이너가 종료됐는지 확인한다. 확인 없이 강제 detach하면 RWO 볼륨에 두 writer가 붙을 수 있다.

현재 hostPath 방식에서는 이 Longhorn RWO snapshot PVC attach 문제가 AI Pod 시작 조건에서 제거됐다. `test_07`에서 `worker2 k3s-agent` 중지 후 AI/audio/BME가 모두 `worker1`에서 Running 됐고, AI Multi-Attach는 재발하지 않았다.

확인 명령

```bash
kubectl -n ai-apps get pvc
kubectl -n ai-apps get deploy safe-edge-integrated-ai -o jsonpath='{.spec.template.spec.volumes}{"\n"}'
kubectl -n longhorn-system get volumes.longhorn.io
kubectl -n ai-apps get pod -o wide
```

현재 resource limit 기준

2026-04-29 기준으로 AI/audio memory limit은 둘 다 `2000Mi`로 맞췄다.

```text
safe-edge-integrated-ai / ai-processor:
  requests: 500m CPU / 1500Mi memory
  limits:   2000m CPU / 2000Mi memory

safe-edge-audio / audio-analyzer:
  requests: 100m CPU / 1500Mi memory
  limits:   1000m CPU / 2000Mi memory

bme280-sensor:
  requests: 50m CPU / 64Mi memory
  limits:   200m CPU / 256Mi memory
```


## 33. 재부팅 후 latest 이미지 pull 때문에 Pod가 복구되지 않는 경우

날짜: 2026-04-29


증상:

```text
worker2 재부팅 후 node-exporter가 ErrImagePull, ImagePullBackOff, CrashLoopBackOff 상태가 됐다.
이벤트에는 registry-1.docker.io DNS 조회 실패 또는 image pull 실패가 기록됐다.
worker2는 클러스터 eth0 네트워크는 살아 있지만 외부 DNS/인터넷 경로가 없거나 늦게 올라올 수 있다.
```

원인:

```text
Kubernetes는 image tag가 latest이고 imagePullPolicy가 명시되지 않으면 이미지를 매번 pull하려고 할 수 있다.
노드에 이미지가 이미 있어도 Always pull 경로를 타면 외부 registry/DNS 상태에 영향을 받는다.
Safe-Edge처럼 내부망 중심으로 운영되는 노드는 재부팅 직후 외부 registry 접근이 안정적이지 않을 수 있다.
```

조치:

```text
운영 Pod에는 imagePullPolicy: IfNotPresent를 명시한다.
IfNotPresent는 노드에 이미지가 있으면 외부 registry에 다시 접속하지 않고 로컬 이미지를 사용한다.
2026-04-29 기준 monitoring의 prometheus, grafana, node-exporter, bme280-sensor에 적용했다.
```

효과:

```text
재부팅 후 외부 DNS/registry 장애 때문에 이미 존재하는 이미지까지 pull 실패하는 문제를 줄인다.
worker2 복구 시 node-exporter와 monitoring Pod가 로컬 이미지로 바로 재기동할 수 있다.
장애 복구 시간이 외부망 상태에 끌려가지 않는다.
```

한계:

```text
노드에 이미지가 없으면 IfNotPresent여도 최초 pull은 필요하다.
latest 태그를 계속 쓰면 실제 실행 버전이 불명확하다.
다음 안정화 단계에서는 prom/prometheus, prom/node-exporter, grafana/grafana의 latest를 명시 버전 태그로 고정하는 것이 좋다.
```

Failback에서 확인한 안전 동작:

```text
worker2 복구 직후 기존 Terminating Pod가 남아 있으면 스크립트는 pod already exists on worker2로 skip한다.
Terminating Pod 정리 후 다음 cron 주기에서 worker1에 남은 대상 Pod만 삭제한다.
이 동작은 잘 돌고 있는 worker2 Pod를 중복으로 건드리지 않기 위한 안전 장치다.
```


## 34. 랜선 제거 테스트에서 잘못 판단하기 쉬운 상태

날짜: 2026-04-28


상황

`worker2` 랜선을 뽑은 직후에도 `kubectl get nodes`가 잠시 `worker2 Ready`를 보여주거나, `kubectl get pods -o wide`가 기존 대상 Pod를 `worker2 Running`으로 보여줄 수 있다.

해석

이 상태는 Failback 성공이 아니다. Kubernetes API의 마지막 관측값이 남아 있는 상태일 수 있다.

올바른 판정

```text
랜선 제거 시각은 테스트 시작 시각으로만 기록한다.
worker2 NotReady/Unreachable 전환 시각을 별도로 기록한다.
대상 Pod 3개가 worker1 Running이 된 시각을 Failover 성공으로 본다.
첫 5분 동안은 worker2 Ready 또는 기존 worker2 Running 표시만으로 성공/실패를 판단하지 않는다.
worker2 NotReady/Unreachable 이후 failback cron은 STOP: worker2 is not Ready 상태여야 한다.
사용자가 랜선을 다시 연결한 시각부터 복구 단계로 기록한다.
랜선 재연결 후 대상 Pod 3개가 worker2 Running이 된 시각을 Failback 성공으로 본다.
데이터 공백 검사는 Failback 성공 후 실행한다.
```

주의

```text
k3s-agent 중지 테스트와 실제 랜선 제거 테스트는 다르다.
k3s-agent 중지는 기존 컨테이너가 잠시 계속 write할 수 있어 중복 write가 관찰될 수 있다.
랜선 제거는 실제 네트워크 단절이므로 데이터 공백 양상이 달라질 수 있다.
```

2026-04-28 실제 랜선 제거 테스트 결과

확인 결과:

```text
worker2 랜선 제거 후 약 34초 뒤 worker2 NotReady가 관찰됐다.
worker2 NotReady 이후 약 31초 뒤 대상 Pod 3개가 worker1 Running 상태가 됐다.
랜선 재연결 후 약 1분 51초 뒤 대상 Pod 3개가 worker2 Running 상태로 복귀했다.
safe-edge-image-prepull 적용 후 이미지 Pulling으로 인한 장시간 지연은 관찰되지 않았다.
```

데이터 결과:

```text
InfluxDB 10초 bucket count 기준 실제 전환 구간에서 0-count 데이터 공백은 확인되지 않았다.
다만 10초 bucket은 몇 초짜리 짧은 failback 공백을 가릴 수 있으므로 다음 테스트부터 1초 bucket count를 추가로 확인한다.
다만 장애/복구 전환 구간에서 평소보다 높은 count가 확인되어 중복 write 가능성이 있다.
```

해석:

```text
랜선 제거 중에도 기존 worker2 Pod가 Kubernetes 관점에서 Terminating으로 남아 있거나,
네트워크 회복 전후로 worker1/worker2 Pod 전환 시간이 겹치면 InfluxDB write가 중복될 수 있다.
데이터 공백보다 중복 write가 문제가 된다면 writer 노드 식별 태그, active writer guard, 또는 중복 제거 쿼리 기준을 별도로 설계해야 한다.
```


## 35. AI 이벤트 스냅샷이 사라지는 경우

날짜: 2026-04-29


`safe-edge-integrated-ai`는 이벤트 감지 시 `/app/snapshots`에 이미지를 저장한다. 현재 운영 기준에서는 AI snapshot Longhorn RWO PVC를 제거했고, `/app/snapshots`는 node-local `hostPath`인 `/var/lib/safe-edge/snapshots`에 마운트한다.

현재 기준:

```text
/app/snapshots -> hostPath /var/lib/safe-edge/snapshots
ai-apps PVC: 없음
Retention: 24시간
Cleanup: snapshot-cleanup sidecar가 1시간마다 24시간 초과 jpg/jpeg/png 삭제
```

확인:

```bash
kubectl -n ai-apps get pvc
kubectl -n ai-apps get pod -l app=safe-edge-integrated-ai -o wide
kubectl -n ai-apps exec deploy/safe-edge-integrated-ai -c ai-processor -- mount | grep snapshots
kubectl -n ai-apps exec deploy/safe-edge-integrated-ai -c ai-processor -- ls -lah /app/snapshots
kubectl -n ai-apps logs deploy/safe-edge-integrated-ai -c snapshot-cleanup --tail=20
```

주의:

```text
snapshot-cleanup은 파일 mtime 기준으로 24시간 초과 파일을 삭제한다.
보관 시간을 바꾸려면 ai-apps/values.yaml의 snapshotStorage.retentionHours를 수정한다.
장기 보관은 node-local hostPath가 아니라 후속 비동기 전송 계층에서 처리한다.
```

## 36. worker2 재부팅 후 k3s-agent가 flannel/default route 문제로 올라오지 않는 경우

날짜: 2026-04-29


증상:

```text
worker2: NotReady
worker2 k3s-agent: activating 반복
k3s-agent log: flannel exited: failed to get default interface: unable to find default route
worker2 시간이 현재보다 뒤처져 certificate not valid before 경고 발생
MetalLB speaker가 10.43.0.1 Kubernetes service IP 접근 실패로 CrashLoopBackOff
Longhorn CSI가 longhorn-backend service 접근 실패로 CrashLoopBackOff
```

원인:

```text
worker2에 default route가 없으면 flannel이 기본 인터페이스를 자동 선택하지 못한다.
master/worker1은 wlan0 default route 때문에 flannel public-ip가 192.168.0.x로 잡히고, worker2는 eth0 10.10.10.12로 잡히면 overlay 경로가 불일치한다.
hostNetwork Pod는 default route가 없을 때 ClusterIP service CIDR로 나가는 라우팅이 실패할 수 있다.
```

조치 기준:

```text
master, worker1, worker2 모두 K3s 실행 옵션에 --flannel-iface eth0를 명시한다.
worker2 시간이 틀어졌으면 현재 시간으로 보정한 뒤 k3s-agent를 재시작한다.
worker2에는 10.43.0.0/16 dev cni0 route를 복구하는 safe-edge-service-cidr-route.service를 둔다.
Longhorn CSI 또는 MetalLB speaker가 이전 네트워크 상태에서 CrashLoopBackOff이면 Pod를 재생성한다.
```

확인:

```bash
kubectl get node master worker1 worker2 -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.annotations.flannel\.alpha\.coreos\.com/public-ip}{"\n"}{end}'
ssh minsoo@10.10.10.12 'ip route | grep 10.43.0.0/16'
kubectl -n metallb-system get pods -o wide
kubectl -n longhorn-system get pods -o wide
```

2026-04-29 적용된 선제 설정

```text
K3s flannel interface:
- master /etc/systemd/system/k3s.service.d/10-flannel-iface.conf
- worker1, worker2 /etc/systemd/system/k3s-agent.service.d/10-flannel-iface.conf
- --flannel-iface eth0
- Wants/After=time-sync.target

Time sync:
- systemd-timesyncd enabled
- timedatectl set-ntp true

worker2 service route:
- /etc/systemd/system/safe-edge-service-cidr-route.service
- 10.43.0.0/16 dev cni0

Kubernetes image pull:
- prometheus/grafana/node-exporter/bme280 imagePullPolicy IfNotPresent

운영 스크립트:
- /usr/local/sbin/safe-edge-preflight-repair.sh
- repository copy: safe-edge/scripts/safe-edge-preflight-repair.sh
```

빠른 점검:

```bash
safe-edge-preflight-repair.sh --check
```

Kubernetes-only 경량 복구:

```bash
safe-edge-preflight-repair.sh --repair
```

주의:

```text
--repair는 OS 설정을 바꾸지 않는다.
worker2 MetalLB speaker, worker2 Longhorn CSI, stale safe-edge-integrated-ai Pod처럼 Kubernetes에서 재생성 가능한 항목만 정리한다.
```

## 37. `safe-edge-integrated-ai`가 카메라는 잡지만 `ai_detection`을 쓰지 못하는 경우

날짜: 2026-05-06

증상:

```text
worker2에서 rpicam-hello --list-cameras는 ov5647 카메라를 인식한다.
safe-edge-integrated-ai Pod는 worker2에서 2/2 Running 상태다.
앱 로그는 InfluxDB 연결, YOLO 모델 로딩, Picamera2 설정 완료까지 출력된다.
하지만 InfluxDB에는 ai_detection measurement가 없거나 최신 write가 없다.
Grafana의 AI/YOLO 결과 패널이 갱신되지 않는다.
```

관찰된 로그:

```text
[INFO] InfluxDB (safe_edge_db) 연결 성공!
[INFO] YOLO 화재 및 Pose 모델 로딩 중...
[INFO] Picamera2 연결 시도 중...
[INFO] ✅ 카메라 연결 및 설정 완료!
Camera frontend has timed out!
Please check that your camera sensor connector is attached securely.
```

판단:

```text
카메라 장치 인식과 실제 프레임 캡처 성공은 다르다.
이 증상은 YOLO 모델이나 InfluxDB 연결 문제가 아니라 Picamera2/libcamera 프레임 캡처 단계에서 멈춘 상태다.
앱 코드상 ai_detection write는 picam2.capture_array(), YOLO 추론 이후에 실행된다.
따라서 capture_array()가 막히면 Pod는 Running이어도 ai_detection이 기록되지 않는다.
```

확인:

```bash
kubectl -n ai-apps get pods -o wide
kubectl -n ai-apps logs deploy/safe-edge-integrated-ai -c ai-processor --tail=200

kubectl -n ai-apps exec deploy/safe-edge-integrated-ai -c ai-processor -- \
  sh -lc 'ls -l /dev/video* /dev/media* /dev/dma_heap /run/udev 2>/dev/null || true'

kubectl -n monitoring exec deploy/influxdb -- \
  influx -database safe_edge_db -execute 'SHOW MEASUREMENTS'

kubectl -n monitoring exec deploy/influxdb -- \
  influx -database safe_edge_db -execute 'SELECT * FROM ai_detection ORDER BY time DESC LIMIT 5'
```

worker2 호스트에서 카메라 캡처를 직접 확인할 때는 먼저 AI Pod가 카메라를 점유하고 있는지 확인한다.
AI Pod가 떠 있는 상태에서 호스트의 `rpicam-still`은 아래처럼 실패할 수 있다.

```text
Pipeline handler in use by another process
failed to acquire camera
```

복구:

```bash
kubectl -n ai-apps scale deploy/safe-edge-integrated-ai --replicas=0
kubectl -n ai-apps rollout status deploy/safe-edge-integrated-ai --timeout=60s

kubectl -n ai-apps scale deploy/safe-edge-integrated-ai --replicas=1
kubectl -n ai-apps rollout status deploy/safe-edge-integrated-ai --timeout=180s

kubectl -n ai-apps logs deploy/safe-edge-integrated-ai -c ai-processor --tail=120

kubectl -n monitoring exec deploy/influxdb -- \
  influx -database safe_edge_db -execute 'SELECT * FROM ai_detection ORDER BY time DESC LIMIT 5'
```

복구 성공 기준:

```text
safe-edge-integrated-ai: worker2 Running, 2/2
ai-processor 로그에서 [AI STATUS] 출력이 반복된다.
InfluxDB SHOW MEASUREMENTS에 ai_detection이 나타난다.
ai_detection.fire_detected / fallen_detected / bending_detected 최신 값이 기록된다.
```

재발 방지 후보:

```text
현재 앱은 프레임 캡처 예외에는 재시도하지만, capture_array() 호출 자체가 장시간 막히면 Kubernetes가 비정상으로 판단하기 어렵다.
후속으로 capture loop heartbeat, livenessProbe, 또는 일정 시간 ai_detection write가 없을 때 프로세스를 종료하는 watchdog을 추가한다.
```

## 38. `start_test.yml` Tailscale 검증 실패와 master `wlan0` 인터넷 단절

날짜: 2026-05-08

증상:

```text
scripts/ansible/playbooks/start_test.yml 실행 중 아래 assert가 실패한다.

TASK [Validate Tailscale on factory-a master]
fatal: [master]: FAILED! => {
  "assertion": "tailscale_status_output is search(factory_a_tailscale.master_hostname)",
  "evaluated_to": false,
  "msg": "Tailscale is not connected as expected on factory-a master"
}
```

master에서 직접 확인하면 Tailscale은 `NoState` 또는 logged out 상태이고, Tailscale IP도 없다.

```text
tailscale status --self:
- Unable to connect to the Tailscale coordination server
- You are logged out
unexpected state: NoState

tailscale ip -4:
no current Tailscale IPs; state: NoState
```

동시에 `wlan0`는 연결되어 있지 않고 default route가 없다.

```text
nmcli dev status:
wlan0  wifi  disconnected  --

ip route:
10.0.0.0/8 dev eth0 ...
10.42.0.0/24 dev cni0 ...
```

원인:

```text
factory-a master의 인터넷 경로는 wlan0 default route에 의존한다.
wlan0 Wi-Fi 프로필이 꼬이거나 AP association이 반복 실패하면 default route가 사라진다.
이 상태에서는 controlplane.tailscale.com DNS/HTTPS 접근이 불가능해져 tailscaled가 control plane과 동기화하지 못한다.
그 결과 start_test.yml의 Tailscale hostname/IP 검증이 실패한다.
```

관찰된 단서:

```text
ping -c1 8.8.8.8:
connect: Network is unreachable

getent hosts controlplane.tailscale.com:
Temporary failure in name resolution

wpa_supplicant:
CTRL-EVENT-ASSOC-REJECT ... status_code=16
```

주의할 점:

```text
Ansible ad-hoc 명령은 playbook의 vars_prompt를 사용하지 않는다.
inventory/group_vars/factory_a.yml은 ansible_password를 factory_a_master_password 변수에서 읽으므로,
ad-hoc 점검 때는 -e 또는 별도 안전한 방식으로 factory_a_master_password를 넘겨야 한다.

Wi-Fi 비밀번호, Tailscale auth key, OAuth secret은 문서와 shell history에 남기지 않는다.
```

확인:

```bash
ansible -i scripts/ansible/inventory/factory-a.ini factory_a_master \
  -e "factory_a_master_password=<ssh-password>" \
  -m shell \
  -a 'hostname; nmcli dev status; ip route; tailscale status --self; tailscale ip -4'
```

master에 직접 SSH로 들어간 경우:

```bash
hostname
nmcli dev status
nmcli -f NAME,UUID,TYPE,DEVICE,AUTOCONNECT con show
nmcli -f SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY dev wifi list ifname wlan0 --rescan yes
ip -br addr
ip route
cat /etc/resolv.conf
ping -c1 -W2 8.8.8.8
getent hosts controlplane.tailscale.com
tailscale status --self
tailscale ip -4
```

복구:

```bash
# SSH는 eth0의 10.10.10.10 경로로 유지한다.
# wlan0 Wi-Fi 프로필만 삭제하고 재생성한다.
sudo nmcli -t -f NAME,TYPE con show | while IFS=: read -r NAME TYPE; do
  if [ "$TYPE" = "802-11-wireless" ] || [ "$TYPE" = "wifi" ]; then
    sudo nmcli con delete "$NAME"
  fi
done

sudo nmcli dev disconnect wlan0 || true
sudo nmcli radio wifi off
sleep 2
sudo nmcli radio wifi on
sleep 5

nmcli -f SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY dev wifi list ifname wlan0 --rescan yes

sudo nmcli dev wifi connect "EZENIC-STUDENT02_5G" \
  password "<wifi-password>" \
  ifname wlan0 \
  name "EZENIC-STUDENT02_5G"

sudo nmcli con mod "EZENIC-STUDENT02_5G" \
  connection.autoconnect yes \
  ipv4.method auto \
  ipv4.never-default no \
  ipv4.route-metric 100
```

인터넷 복구 확인:

```bash
nmcli -f DEVICE,TYPE,STATE,CONNECTION dev status
nmcli -f IP4.ADDRESS,IP4.GATEWAY,IP4.DNS dev show wlan0
ip route
ping -c1 -W2 8.8.8.8
getent hosts controlplane.tailscale.com
```

예상 성공 상태:

```text
wlan0 connected EZENIC-STUDENT02_5G
IP4.ADDRESS: 192.168.0.x/24
IP4.GATEWAY: 192.168.0.1
default via 192.168.0.1 dev wlan0
ping 8.8.8.8 성공
controlplane.tailscale.com DNS 조회 성공
```

Tailscale 복구:

```bash
sudo systemctl restart tailscaled
sleep 10
systemctl is-active tailscaled
tailscale status --self
tailscale ip -4
```

예상 성공 상태:

```text
tailscaled: active
tailscale status --self:
100.117.40.125  factory-a-master  factory-a-master.tailf83767.ts.net  linux

tailscale ip -4:
100.117.40.125
```

`start_test.yml` 재검증:

```bash
cd scripts/ansible
ansible-playbook -i inventory/factory-a.ini playbooks/start_test.yml
```

재발 방지:

```text
start_test.yml의 Tailscale 실패가 나오면 Tailscale hostname 불일치만 보지 말고,
먼저 master의 wlan0 상태, default route, DNS, controlplane.tailscale.com 접근성을 확인한다.

Wi-Fi 재연결 실패가 반복되면 기존 Wi-Fi 프로필을 삭제하고 새로 만들면 NetworkManager secret/profile 꼬임을 해소할 수 있다.

factory-a OS baseline의 의도는 eth0=K3s 내부망, wlan0=인터넷 default route다.
eth0에는 default route를 두지 않고 wlan0에 default route가 있어야 한다.
```

## 39. worker1 `eth0` IPv4 미할당과 NetworkManager connection profile 삭제 후 단절

날짜: 2026-05-08

상황:

```text
대상: Raspberry Pi 5 / factory-a worker1
역할: K3s worker node
네트워크 관리자: NetworkManager
목표: eth0에 고정 IP를 부여해 K3s 노드 간 통신을 안정화한다.
기대 IP: 10.10.10.11
```

증상:

```text
ifconfig 또는 ip addr에서 eth0 장치는 UP/RUNNING 상태다.
하지만 eth0에 IPv4 주소가 없고 IPv6 link-local 주소만 보인다.

sudo systemctl restart NetworkManager 실행 시
NetworkManager-wait-online.service 단계에서 timeout 또는 FAILED가 발생한다.

nmtui의 Edit a connection 화면에 eth0 프로필이 보이지 않는다.
대신 Wired connection 1 같은 자동 생성 Ethernet 프로필만 보인다.

Wired connection 1을 삭제한 뒤 아래 명령을 실행하면 실패한다.

nmcli connection up eth0
Error: unknown connection 'eth0'
```

원인:

```text
물리 장치(Device) 이름과 논리 연결 설정(Connection Profile) 이름을 혼동했다.

eth0는 커널/NetworkManager가 인식하는 물리 네트워크 장치 이름이다.
반면 nmcli connection up <name>에서 <name>은 NetworkManager connection profile 이름이다.

기존 static IP 프로필이 없거나 무시된 상태에서 NetworkManager가 DHCP 방식의
Wired connection 1 프로필을 자동 생성했다.
DHCP 서버에서 IPv4를 받지 못하면 eth0는 UP이어도 IPv4가 비어 있을 수 있다.

그 상태에서 Wired connection 1을 삭제하면 eth0 장치에 적용할 connection profile 자체가 없어져
nmcli connection up eth0 명령이 unknown connection으로 실패한다.
```

확인:

```bash
ip -br addr show eth0
nmcli dev status
nmcli -f NAME,UUID,TYPE,DEVICE,AUTOCONNECT con show
nmcli -f GENERAL.DEVICE,GENERAL.STATE,IP4.ADDRESS,IP4.GATEWAY,IP4.DNS device show eth0
systemctl status NetworkManager --no-pager
systemctl status NetworkManager-wait-online --no-pager
```

판단 기준:

```text
DEVICE 목록에는 eth0가 보이는데 connection profile 목록에는 eth0가 없을 수 있다.
이 경우 nmcli connection up eth0는 실패한다.
프로필 이름이 Wired connection 1이면 nmcli connection up "Wired connection 1"처럼 profile 이름으로 실행해야 한다.
운영 기준에서는 profile 이름과 device 이름을 모두 eth0로 맞춰 혼동을 줄인다.
```

복구 방법 1: `nmtui`로 새 Ethernet 프로필 생성

```bash
sudo nmtui
```

```text
Edit a connection
Add
Ethernet

Profile name: eth0
Device: eth0
IPv4 CONFIGURATION: Manual
Addresses: 10.10.10.11/<prefix>
Gateway: 필요 시 입력. factory-a 내부망 eth0에는 보통 default gateway를 두지 않는다.
DNS servers: 필요 시 입력
Automatically connect: enabled
```

저장 후 적용:

```bash
sudo systemctl restart NetworkManager
nmcli dev status
ip -br addr show eth0
ip route
```

복구 방법 2: `nmcli`로 직접 생성

```bash
sudo nmcli con delete eth0 || true
sudo nmcli con add type ethernet ifname eth0 con-name eth0
sudo nmcli con mod eth0 \
  ipv4.method manual \
  ipv4.addresses 10.10.10.11/24 \
  ipv4.never-default yes \
  connection.autoconnect yes
sudo nmcli con up eth0
```

factory-a 네트워크 역할 기준:

```text
eth0: K3s 내부망. worker1은 10.10.10.11/24를 사용한다.
wlan0: 인터넷 default route. 패키지 설치, Tailscale control plane, 외부 DNS는 wlan0 경로를 사용한다.

eth0에 default gateway를 넣으면 K3s 내부망과 인터넷 경로가 섞여 flannel/Tailscale/패키지 설치 장애로 이어질 수 있다.
```

복구 성공 기준:

```text
ip -br addr show eth0:
eth0 UP 10.10.10.11/24 ...

nmcli dev status:
eth0 ethernet connected eth0

ip route:
10.10.10.0/24 dev eth0 ...
default route는 wlan0에 존재한다.

master에서:
ping -c1 10.10.10.11
kubectl get nodes -o wide
```

재발 방지:

```text
새 Raspberry Pi 노드를 추가할 때 NetworkManager profile name과 device name을 eth0로 통일한다.
factory-a inventory/group_vars/factory_a.yml의 노드 IP와 실제 NetworkManager static IP를 일치시킨다.
Ansible factory_a_os_baseline.yml을 적용해 hostname, eth0 static IP, wlan0 default route 역할을 표준화한다.
NetworkManager profile을 삭제하기 전에는 nmcli con show 출력으로 profile/device 매핑을 확인한다.
```

## 40. KEY TROUBLE - factory-a `eth0`/`wlan0` 역할 고정과 `/8`에서 `/24` 정상화 시 접근 경로 변화

날짜: 2026-05-08

상황:

```text
factory-a 3노드는 eth0와 wlan0를 동시에 사용한다.

eth0:
- K3s 내부망
- 노드 간 통신
- 10.10.10.0/24

wlan0:
- 외부 인터넷
- DNS
- Tailscale control plane
- package/image pull
```

이번에 확정한 운영 정책:

```text
eth0는 내부망 전용이다.
eth0에는 default gateway를 두지 않는다.
eth0는 default route를 만들 수 없게 한다.
eth0는 DNS를 받지 않는다.

wlan0만 인터넷 default route와 DNS를 담당한다.
route metric은 wlan0가 낮고 eth0가 높다.
```

최종 노드별 IP:

```text
master:
  eth0 10.10.10.10/24
  wlan0 192.168.0.45/24
  tailscale0 100.117.40.125/32

worker1:
  eth0 10.10.10.11/24
  wlan0 192.168.0.43/24

worker2:
  eth0 10.10.10.12/24
  wlan0 192.168.0.44/24
```

최종 NetworkManager profile 기준:

```text
eth0:
  connection.id: eth0
  connection.interface-name: eth0
  connection.autoconnect: yes
  connection.autoconnect-priority: 50
  ipv4.method: manual
  ipv4.addresses: 10.10.10.x/24
  ipv4.gateway: 없음
  ipv4.never-default: yes
  ipv4.ignore-auto-routes: yes
  ipv4.ignore-auto-dns: yes
  ipv4.route-metric: 500
  ipv6.method: disabled

wlan0:
  connection.id: EZENIC-STUDENT02_5G
  connection.interface-name: wlan0
  connection.autoconnect: yes
  connection.autoconnect-priority: 10
  ipv4.method: auto
  ipv4.never-default: no
  ipv4.ignore-auto-routes: no
  ipv4.ignore-auto-dns: no
  ipv4.route-metric: 100
```

최종 route 기준:

```text
default via 192.168.0.1 dev wlan0 metric 100
10.10.10.0/24 dev eth0 metric 500
192.168.0.0/24 dev wlan0 metric 100
```

중요한 관찰:

```text
master가 과거에 10.10.10.10/8로 잡혀 있었다.
이 설정은 너무 넓고, 10.0.0.0/8 전체를 eth0로 보내는 위험한 route를 만든다.

10.10.10.10/24로 정상화하면 factory-a 내부망은 올바르게 좁아진다.
하지만 작업자 로컬 머신이 10.10.10.0/24에 직접 붙어 있지 않으면
로컬에서 10.10.10.10/11/12로 직접 SSH/ping이 더 이상 되지 않을 수 있다.

이것은 eth0 설정 실패가 아니라, 잘못 넓던 /8 경로에 기대던 접근 방식이 사라진 것이다.
운영 접근은 master Tailscale IP 또는 wlan0 IP를 사용한다.
```

접근 경로 기준:

```text
내부 클러스터 통신:
  master <-> worker1/worker2: 10.10.10.0/24 eth0

외부 운영 접근:
  master: 100.117.40.125 Tailscale
  worker1: 192.168.0.43 wlan0
  worker2: 192.168.0.44 wlan0

로컬 작업 머신이 10.10.10.0/24에 직접 연결되어 있지 않으면
10.10.10.x 직접 접근을 기대하지 않는다.
```

적용 명령 예시:

```bash
# master
sudo nmcli con delete eth0 || true
sudo nmcli con add type ethernet ifname eth0 con-name eth0
sudo nmcli con mod eth0 \
  connection.interface-name eth0 \
  connection.autoconnect yes \
  connection.autoconnect-priority 50 \
  ipv4.method manual \
  ipv4.addresses 10.10.10.10/24 \
  ipv4.gateway "" \
  ipv4.never-default yes \
  ipv4.ignore-auto-routes yes \
  ipv4.ignore-auto-dns yes \
  ipv4.route-metric 500 \
  ipv6.method disabled
sudo nmcli con up eth0
```

```bash
# worker1
sudo nmcli con delete eth0 || true
sudo nmcli con add type ethernet ifname eth0 con-name eth0
sudo nmcli con mod eth0 \
  connection.interface-name eth0 \
  connection.autoconnect yes \
  connection.autoconnect-priority 50 \
  ipv4.method manual \
  ipv4.addresses 10.10.10.11/24 \
  ipv4.gateway "" \
  ipv4.never-default yes \
  ipv4.ignore-auto-routes yes \
  ipv4.ignore-auto-dns yes \
  ipv4.route-metric 500 \
  ipv6.method disabled
sudo nmcli con up eth0
```

```bash
# worker2
sudo nmcli con delete eth0 || true
sudo nmcli con add type ethernet ifname eth0 con-name eth0
sudo nmcli con mod eth0 \
  connection.interface-name eth0 \
  connection.autoconnect yes \
  connection.autoconnect-priority 50 \
  ipv4.method manual \
  ipv4.addresses 10.10.10.12/24 \
  ipv4.gateway "" \
  ipv4.never-default yes \
  ipv4.ignore-auto-routes yes \
  ipv4.ignore-auto-dns yes \
  ipv4.route-metric 500 \
  ipv6.method disabled
sudo nmcli con up eth0
```

```bash
# 세 노드 공통 wlan0 profile 정책
sudo nmcli con mod "EZENIC-STUDENT02_5G" \
  connection.interface-name wlan0 \
  connection.autoconnect yes \
  connection.autoconnect-priority 10 \
  ipv4.method auto \
  ipv4.never-default no \
  ipv4.ignore-auto-routes no \
  ipv4.ignore-auto-dns no \
  ipv4.route-metric 100
```

현재 runtime route가 DHCP metric 600으로 남아 있을 때 즉시 정리:

```bash
WLAN_IP=$(ip -4 -o addr show wlan0 | awk '{print $4}' | cut -d/ -f1 | head -1)
GW=$(ip route show default | awk '$0 ~ /dev wlan0/ {print $3; exit}')

sudo ip route replace default via "$GW" dev wlan0 src "$WLAN_IP" metric 100
sudo ip route replace 192.168.0.0/24 dev wlan0 src "$WLAN_IP" metric 100

sudo ip route del default via "$GW" dev wlan0 proto dhcp src "$WLAN_IP" metric 600 2>/dev/null || true
sudo ip route del 192.168.0.0/24 dev wlan0 proto kernel scope link src "$WLAN_IP" metric 600 2>/dev/null || true
```

검증:

```bash
nmcli -f DEVICE,TYPE,STATE,CONNECTION dev status
ip -br addr show eth0
ip -br addr show wlan0
ip route

nmcli -f connection.id,connection.interface-name,connection.autoconnect,connection.autoconnect-priority,ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.never-default,ipv4.ignore-auto-routes,ipv4.ignore-auto-dns,ipv4.route-metric,ipv6.method con show eth0

WIFI_UUID=$(nmcli -t -f UUID,DEVICE con show --active | grep ':wlan0$' | cut -d: -f1 | head -1)
nmcli -f connection.id,connection.interface-name,connection.autoconnect,connection.autoconnect-priority,ipv4.method,ipv4.never-default,ipv4.ignore-auto-routes,ipv4.ignore-auto-dns,ipv4.route-metric con show "$WIFI_UUID"
```

cluster 검증:

```bash
# master에서
ip -4 -o addr show dev wlan0 scope global
ip route show default | grep 'dev wlan0'
getent hosts controlplane.tailscale.com
curl -fsS -o /dev/null --max-time 5 https://controlplane.tailscale.com/key?v=1 && echo reachable

ping -c1 -W2 10.10.10.11
ping -c1 -W2 10.10.10.12
kubectl get nodes -o wide
tailscale status --self
tailscale ip -4
```

검증 결과:

```text
master -> worker1 ping: 성공
master -> worker2 ping: 성공
Tailscale master IP: 100.117.40.125
kubectl get nodes -o wide:
  master Ready  INTERNAL-IP 10.10.10.10
  worker1 Ready INTERNAL-IP 10.10.10.11
  worker2 Ready INTERNAL-IP 10.10.10.12
start_test 실행 경로:
  control host 10.10.10.100 -> master 10.10.10.10 over eth0/internal route
start_test 내부 검증:
  master wlan0 internet path -> Tailscale control plane -> tailscaled status/ip
```

주의:

```text
eth0 profile을 삭제/재생성하는 작업은 현재 SSH 경로가 eth0일 때 접속을 끊을 수 있다.
master는 Tailscale IP로 우회 접근하고, worker는 wlan0 IP로 우회 접근 가능한 상태에서 작업한다.

NetworkManager profile 이름과 device 이름을 혼동하지 않는다.
nmcli con up eth0의 eth0는 device가 아니라 connection profile 이름이다.

wlan0가 끊기면 인터넷, DNS, Tailscale control plane, image pull은 실패할 수 있다.
하지만 eth0 static profile과 K3s 내부망은 독립적으로 유지되어야 한다.
```

## 41. Data/Dashboard VPC 재생성 때 Route53 Hosted Zone NS가 바뀌는 문제

날짜: 2026-05-26

증상/상황

`infra/data-dashboard`를 destroy 후 다시 apply하면 `aegis-pi.cloud` Route53 Hosted Zone이 새로 생성되고 NS 4개가 바뀐다.

이 상태에서는 Gabia 네임서버 위임을 매번 수동으로 다시 입력해야 하며, 위임 전에는 ACM DNS validation이 대기 상태로 오래 멈출 수 있다.

원인

Route53 Hosted Zone이 VPC/App stack과 같은 Terraform root/state(`infra/data-dashboard`)에 포함되어 있었다. 따라서 데모 비용 절감을 위해 Data/Dashboard VPC를 destroy할 때 hosted zone도 같이 삭제됐다.

해결/판단

Hosted Zone은 월 고정 비용이 낮고 NS 위임 안정성이 중요하므로 영구 자원으로 분리한다.

```text
infra/data-dashboard-dns/ = Route53 Hosted Zone 영구 관리
infra/data-dashboard/     = VPC, ALB, ECS, ACM, CloudFront, DNS record 등 재생성 자원 관리
```

`infra/data-dashboard-dns`의 hosted zone에는 `prevent_destroy = true`를 적용한다. `infra/data-dashboard`는 hosted zone을 생성하지 않고 data source로 조회한 뒤 ACM validation record와 `api`, `dashboard` alias record만 관리한다.

state 이전 절차

```bash
terraform -chdir=infra/data-dashboard-dns init

ZONE_ID=$(terraform -chdir=infra/data-dashboard output -raw route53_zone_id)
terraform -chdir=infra/data-dashboard-dns import aws_route53_zone.dashboard "$ZONE_ID"

terraform -chdir=infra/data-dashboard state rm aws_route53_zone.dashboard

terraform -chdir=infra/data-dashboard plan -var="dashboard_domain_name=aegis-pi.cloud"
terraform -chdir=infra/data-dashboard-dns plan
```

주의

```text
state rm은 AWS Route53 Hosted Zone을 삭제하지 않는다.
기존 Terraform state에서 추적만 해제한다.

import 전에 infra/data-dashboard-dns backend key가 data-dashboard와 다른지 확인한다.
잘못된 state에 import하면 소유권이 꼬일 수 있다.

이 절차 중 destroy 명령은 실행하지 않는다.
```

검증 기준

```text
infra/data-dashboard plan:
  - aws_route53_zone.dashboard create/destroy가 없어야 함
  - ACM validation record, api/dashboard record만 기존 zone을 참조해야 함

infra/data-dashboard-dns plan:
  - import 후 No changes
```

재발 방지/주의

Hosted Zone은 Data/Dashboard destroy 대상이 아니다. destroy 후에도 남는 영구 자원으로 간주하고, 비용 기준에는 Route53 hosted zone `$0.50/월`을 계속 반영한다.

## 42. DynamoDB HISTORY 과부하로 인한 cascade 504 Gateway Timeout

날짜: 2026-05-28

증상

`/history?window=24h` 엔드포인트에 3공장 동시 조회 요청이 들어올 때 cascade 504 Gateway Timeout이 발생했다.

```text
GET /factories/factory-a/history?window=24h → 504 Gateway Timeout
GET /factories/factory-b/history?window=24h → 504 Gateway Timeout
GET /factories/factory-c/history?window=24h → 504 Gateway Timeout
```

원인

DynamoDB HISTORY 테이블(`AEGIS-DynamoDB-FactoryStatus`)에 `HISTORY_TTL_HOURS=48h` × factory_state 3초 주기 × 3공장 기준으로 약 116,000개 이상의 `HISTORY#STATE` 아이템이 상주했다.

`/history?window=24h` 조회는 24시간 구간 내 모든 아이템을 페이지 단위로 쿼리한다. 3공장이 동시에 요청하면 50개 이상의 DynamoDB Query 페이지 호출이 병렬로 발생해 backend asyncio semaphore(한도 10)가 포화됐다. 포화된 semaphore 대기열에 새 요청이 쌓이면서 연쇄적으로 504가 발생했다.

아이템 수 구조:

```text
factory_state: 3초 주기 × 3,600초 × 48h = 공장당 약 57,600개
infra_state:   20초 주기 × 3,600초 × 48h = 공장당 약  8,640개
3공장 합계: 약 200,000개 이상 → DynamoDB Query 페이지 50회+ 병렬 발생
```

임시 조치 (sha-e17dbbf, 2026-05-28)

`apps/dashboard-backend/services/ddb.py` `_get_history_sync()` 수정:

```python
ScanIndexForward=False  # 최신 아이템부터 역순 쿼리
Limit=300               # 페이지당 최대 300개
max_items=500           # 전체 최대 500개 cap
# 이후 reversed() 로 오름차순 반환
```

Frontend `useFleetRecentChanges` window를 24h → 1h로 변경.

최신 500개를 역순으로 가져온 뒤 오름차순으로 반환해 최신 데이터를 보존한다. 과거 구간보다 현재에 가까운 데이터가 유지된다.

한계

500개 cap으로 1시간 이상 이전 구간의 데이터를 버리기 때문에 해당 구간에서 발생한 스파이크(위험 수치 급등 이벤트)가 차트에서 표시되지 않는 데이터 유실 문제가 잔존한다.

근본 해결 — ADR 0025 구현 완료 (2026-05-29)

Multi-resolution storage 아키텍처로 전환 완료.

```text
HISTORY#STATE:  기존 HISTORY#STATE#* TTL 48h → 2h 예정 (data-processor 변경 필요).
                현재는 48h 유지, window=1h 전용 raw 조회 경로로 사용.
GRAPH#5M:       기존 DynamoDB 테이블 내 GRAPH#5M#* prefix. 5분 단위 집계. TTL 48h.
                Lambda AEGIS-Lambda-GraphAggregator5m (EventBridge 5분 주기) 운영 중.
Backend:        window=1h → HISTORY#STATE# query + max_items=500 cap 유지
                window=6h/12h/24h → GRAPH#5M# query (cap 없음, 최대 288 items/공장)
Frontend:       RiskScoreChart: ComposedChart — risk_score_avg Area + risk_score_min 마커
                NodeResourceChart: GRAPH#5M 데이터 시 aggregate line fallback
```

2026-05-29 기준 DDB 상태:

```text
GRAPH#5M items: 공장당 12개 (Aggregator 최근 배포, 약 1시간치)
HISTORY#STATE TTL: 48h (data-processor TTL 2h 변경 미적용)
HISTORY#STATE 1h window items: ~1,700개/공장 (max_items=500 cap으로 제한)
```

현재 재발 상태:

- `window=6h/12h/24h` 요청은 GRAPH#5M 경로로 분기 → semaphore 포화 없음 ✅
- `window=1h` 요청은 max_items=500 cap 유지 → 최신 데이터 500개만 반환 ✅

HISTORY#STATE TTL 2h 변경 시 추가 작업:

```bash
# data-pipeline Terraform에서 HISTORY_TTL_HOURS=2 적용 후 apply
terraform -chdir=infra/data-pipeline plan -var="dynamodb_history_ttl_hours=2"
terraform -chdir=infra/data-pipeline apply -var="dynamodb_history_ttl_hours=2"
```

TTL 변경 적용 후 기존 48h 아이템이 자연 만료(DynamoDB TTL eventually consistent)될 때까지
일정 시간이 걸릴 수 있다. 그동안은 max_items=500 cap이 여전히 유효하다.
max_items cap 제거는 HISTORY#STATE steady-state item count가 3h 미만으로 안정된 후에 한다.

확인 명령

```bash
# HISTORY#STATE item count 현황
for FACTORY in factory-a factory-b factory-c; do
  echo -n "$FACTORY HISTORY: "
  aws dynamodb query \
    --region ap-south-1 \
    --table-name AEGIS-DynamoDB-FactoryStatus \
    --key-condition-expression 'pk = :pk AND sk BETWEEN :s AND :e' \
    --expression-attribute-values "{\":pk\":{\"S\":\"FACTORY#$FACTORY\"},\":s\":{\"S\":\"HISTORY#STATE#\"},\":e\":{\"S\":\"HISTORY#STATE#~\"}}" \
    --select COUNT \
    --query 'Count' \
    --output text
  echo -n "$FACTORY GRAPH#5M: "
  aws dynamodb query \
    --region ap-south-1 \
    --table-name AEGIS-DynamoDB-FactoryStatus \
    --key-condition-expression 'pk = :pk AND sk BETWEEN :s AND :e' \
    --expression-attribute-values "{\":pk\":{\"S\":\"FACTORY#$FACTORY\"},\":s\":{\"S\":\"GRAPH#5M#\"},\":e\":{\"S\":\"GRAPH#5M#~\"}}" \
    --select COUNT \
    --query 'Count' \
    --output text
done

# ECS backend 로그에서 semaphore/timeout 에러 확인
aws logs filter-log-events \
  --region ap-south-1 \
  --log-group-name /ecs/kjw-aegis-data-backend \
  --filter-pattern "semaphore OR timeout OR DynamoDB" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --query 'events[*].message' \
  --output text
```

## 43. Dashboard Factory 화면 자동 refresh 지연/깜빡임 및 흰 화면

날짜: 2026-06-08

증상/상황

Dashboard Web의 Fleet/Factory 화면에서 5s~10s 자동 refresh를 켜면 다음 문제가 발생했다.

- 10m trend와 1h 그래프를 위해 refresh마다 1h history를 다시 읽어 화면이 느리게 뜸.
- 그래프가 refresh 때 spinner로 바뀌며 깜빡임.
- 신규 포인트가 자연스럽게 추가되지 않고 전체 그래프가 다시 그려지는 것처럼 보임.
- Factory 화면 진입 또는 빠른 factory 이동 중 흰색 바탕 화면만 남는 현상이 발생.
- 1h 그래프 tooltip이 시간 대신 숫자 timestamp label을 표시함.

원인

초기 구현은 10m trend도 `/factories/{factory_id}/history?window=1h` 응답을 받아 브라우저에서 최근 10분만 필터링했다. `useFactoryHistory.refresh()`는 브라우저 cache를 강제 우회하면서 `loading=true`로 바꿨기 때문에 자동 refresh 때 기존 그래프를 유지하지 못하고 spinner로 교체됐다.

또한 1h raw chart를 시간축으로 바꾸기 전에는 Recharts category/index 축과 subsampling이 섞여 새 포인트가 들어올 때 기존 점의 x좌표와 샘플링 대상이 재계산됐다. 이 때문에 데이터가 바뀌는 것처럼 보였다.

Factory 화면 흰 화면은 React render 중 예외가 발생했을 때 앱 전체를 보호하는 ErrorBoundary가 없어 발생할 수 있었다. `/factory/:factoryId`는 같은 `FactoryPage` 컴포넌트 인스턴스에서 `factoryId`만 바뀌므로, 이전 factory의 async API 응답이나 history 응답이 새 factory 화면 state를 덮는 race 가능성도 있었다.

확인/판단 기준

```bash
# Backend history API 계약 검증
cd apps/dashboard-backend
pytest -q tests/test_history.py

# Dashboard Web 타입/렌더 회귀 검증
cd apps/dashboard-web
npm run lint
npm test -- --run
npm run build
```

브라우저에서 흰 화면이 보이면 DevTools Console에 React runtime error가 남는다. ErrorBoundary 적용 후에는 흰 화면 대신 오류 카드와 실제 error message가 표시되어야 한다.

해결

Backend history API:

- `window=10m` 기본 limit을 250으로 지정.
- `window=1h` 기본 limit을 2000으로 지정.
- `since=<iso timestamp>` query를 추가해 자동 refresh 때 마지막 timestamp 이후 신규 item만 반환.

Frontend history 조회:

- Factory header 10m trend는 `window=10m&limit=250` 전용 조회로 분리.
- 1h 그래프는 `window=1h&limit=2000` 기준 유지.
- `useFactoryHistory`를 stale-while-revalidate 방식으로 변경해 기존 그래프를 유지하면서 delta fetch 결과만 merge.
- WebSocket LATEST 메시지는 Factory 화면 현재 상태와 10m trend buffer에 append.
- Fleet 카드 trend도 10m history 기준으로 delta merge.

Frontend chart 렌더링:

- 10m compact trend는 배열 index가 아니라 실제 timestamp 기반 x좌표로 렌더링.
- 1h raw Risk/Sensor/AI/Node 그래프는 category axis 대신 time scale 사용.
- 1h raw 그래프는 전체 포인트를 그대로 표시하고, line animation을 꺼 refresh 때 선이 morphing되는 느낌을 줄임.
- 1h raw tooltip은 커스텀 tooltip으로 교체해 `HH:MM:SS`와 값/단위를 표시.

Factory 화면 안정화:

- `ErrorBoundary` 추가: render error 발생 시 흰 화면 대신 오류 카드와 새로고침 버튼 표시.
- `useFactory`에 request sequence guard 추가: 이전 factory 응답이 현재 factory state를 덮지 않음.
- `useFactoryHistory`에 key 변경 reset과 request sequence guard 추가: 이전 history 응답이 현재 그래프 state에 섞이지 않음.

수정 파일

```text
apps/dashboard-backend/routers/factories.py
apps/dashboard-backend/services/ddb.py
apps/dashboard-backend/tests/test_history.py
apps/dashboard-web/src/api/client.ts
apps/dashboard-web/src/components/Chart.tsx
apps/dashboard-web/src/components/ErrorBoundary.tsx
apps/dashboard-web/src/components/RiskTrendChart.tsx
apps/dashboard-web/src/hooks/useFactories.ts
apps/dashboard-web/src/hooks/useFactory.ts
apps/dashboard-web/src/hooks/useFactoryHistory.ts
apps/dashboard-web/src/hooks/useFleetRecentChanges.ts
apps/dashboard-web/src/pages/FactoryPage.tsx
apps/dashboard-web/src/pages/FleetPage.tsx
apps/dashboard-web/src/utils/trend.ts
docs/specs/data_storage_pipeline.md
docs/specs/monitoring_dashboard/02_api_spec.md
docs/specs/monitoring_dashboard/05_screen_data_mapping.md
```

검증 결과

2026-06-08 로컬 검증:

```text
apps/dashboard-backend: pytest -q tests/test_history.py → 35 passed
apps/dashboard-backend: pytest -q → 100 passed
apps/dashboard-web: npm run lint → 통과
apps/dashboard-web: npm test -- --run → 59 passed
apps/dashboard-web: npm run build → 통과
repo root: git diff --check → 통과
```

재발 방지/주의

- 10m trend를 위해 1h history를 재사용하지 않는다.
- 자동 refresh는 full reload가 아니라 `since` delta fetch + client merge를 기본으로 한다.
- Factory route처럼 URL 파라미터만 바뀌는 화면은 async 응답 race를 막기 위해 request sequence guard를 둔다.
- Recharts time scale을 사용할 때 기본 tooltip label은 raw numeric x값이 될 수 있으므로, 사용자 화면에는 custom tooltip을 사용한다.
- React SPA에는 route 전체를 보호하는 ErrorBoundary를 유지한다.
