import React, { useRef, useEffect, useState } from "react";

const MapCanvas = ({
  mapData,
  onObjectClick,
  onMapDataUpdate,
  activeMenu,
  amrPosition,
  onAddStation,
  amrIP,
  onAddPathFromContext, // App에서 전달받은 패스 추가 함수 (두 스테이션을 인자로 받음)
  laserData,
}) => {
  const canvasRef = useRef(null);

  // 확대/축소, 오프셋, 드래그 관련 상태 (scale 단위: 픽셀/미터)
  const [scale, setScale] = useState(40);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // Hover, 클릭된 오브젝트, tooltip 상태
  const [hoveredObject, setHoveredObject] = useState(null);
  const [clickedObject, setClickedObject] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  // 커브 수정 관련 상태
  const [editingCurve, setEditingCurve] = useState(null);
  const [draggingHandle, setDraggingHandle] = useState(null);

  // 스테이션 추가 관련 상태
  const [stationAddInfo, setStationAddInfo] = useState(null);

  // 맵 좌표 영역 (map unit 1 = 1m로 가정)
  const minPos = useRef(
    mapData.header ? mapData.header.minPos : { x: 0, y: 0 }
  );
  const maxPos = useRef(
    mapData.header ? mapData.header.maxPos : { x: 100, y: 100 }
  );

  // Canvas 크기 상태
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });

  // ── 신규: 패스 추가 모드 관련 상태 ──
  const [isPathAdding, setIsPathAdding] = useState(false);
  const [pathAddStart, setPathAddStart] = useState(null);
  const [pathPreviewPos, setPathPreviewPos] = useState(null);

  useEffect(() => {
    console.log("MapCanvas Received Map Data:", mapData);
  }, [mapData]);

  useEffect(() => {
    if (activeMenu === 0) console.log("실시간 위치 활성화");
    else if (activeMenu === 1) console.log("SLAM 진행 활성화");
  }, [activeMenu]);

  // Canvas 크기 동기화
  useEffect(() => {
    const canvas = canvasRef.current;
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      setCanvasSize({ width: canvas.width, height: canvas.height });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 외부에서 mapData 업데이트 시 원점(중심) 재설정
  const prevVersion = useRef(null);
  useEffect(() => {
    if (mapData && mapData.header && canvasSize.width && canvasSize.height) {
      if (prevVersion.current !== mapData.header.version) {
        const mapHeight = maxPos.current.y - minPos.current.y;
        setOffset({
          x: canvasSize.width / 2 + minPos.current.x * scale,
          y:
            canvasSize.height / 2 -
            (1 + minPos.current.y / mapHeight) * (mapHeight * scale),
        });
        prevVersion.current = mapData.header.version;
      }
    }
  }, [mapData, canvasSize, scale]);

  // 좌표 변환 함수 (맵 좌표 -> 화면 좌표)
  const transformCoordinates = (mapX, mapY) => {
    const mapWidth = maxPos.current.x - minPos.current.x;
    const mapHeight = maxPos.current.y - minPos.current.y;
    const screenX = (mapX - minPos.current.x) * scale + offset.x;
    const screenY =
      (1 - (mapY - minPos.current.y) / mapHeight) * (mapHeight * scale) +
      offset.y;
    return { x: screenX, y: screenY };
  };

  // 화면 좌표 -> 맵 좌표
  const inverseTransformCoordinates = (screenX, screenY) => {
    const mapWidth = maxPos.current.x - minPos.current.x;
    const mapHeight = maxPos.current.y - minPos.current.y;
    const mapX = (screenX - offset.x) / scale + minPos.current.x;
    const mapY =
      minPos.current.y +
      (1 - (screenY - offset.y) / (mapHeight * scale)) * mapHeight;
    return { x: mapX, y: mapY };
  };

  // 캔버스 내 좌표를 클라이언트 좌표로 변환
  const getClientCoordinates = (canvasCoords) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + (canvasCoords.x / canvas.width) * rect.width;
    const clientY = rect.top + (canvasCoords.y / canvas.height) * rect.height;
    return { x: clientX, y: clientY };
  };

  // 캔버스 내부 마우스 좌표 구하기
  const getCanvasMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // 오브젝트 HitTest 함수
  const checkClickedObject = (mouseX, mouseY) => {
    let found = null;
    (mapData.advancedPointList || []).forEach((station) => {
      const screenPos = transformCoordinates(station.pos.x, station.pos.y);
      if (Math.hypot(mouseX - screenPos.x, mouseY - screenPos.y) < 15)
        found = { type: "advancedPoint", data: station };
    });
    if (!found) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      (mapData.advancedCurveList || []).forEach((curve) => {
        const start = transformCoordinates(
          curve.startPos.pos.x,
          curve.startPos.pos.y
        );
        const c1 = transformCoordinates(
          curve.controlPos1.x,
          curve.controlPos1.y
        );
        const c2 = transformCoordinates(
          curve.controlPos2.x,
          curve.controlPos2.y
        );
        const end = transformCoordinates(
          curve.endPos.pos.x,
          curve.endPos.pos.y
        );
        const path = new Path2D();
        path.moveTo(start.x, start.y);
        path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
        ctx.save();
        ctx.lineWidth = 10;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (ctx.isPointInStroke(path, mouseX, mouseY))
          found = { type: "advancedCurve", data: curve };
        ctx.restore();
      });
    }
    return found;
  };

  // 왼쪽 클릭: 빈 공간 클릭 시 InfoPanel 제거 또는 스테이션 추가 처리
  const handleCanvasClick = (e) => {
    e.preventDefault();
    const pos = getCanvasMousePos(e);
    if (isPathAdding) {
      const clicked = checkClickedObject(pos.x, pos.y);
      if (clicked && clicked.type === "advancedPoint") {
        const selectedStation = clicked.data;
        // 시작 스테이션과 동일한 경우 알림
        if (selectedStation.instanceName === pathAddStart.instanceName) {
          alert("시작 스테이션과 동일합니다.");
          return;
        }
        // 이미 패스가 존재하는지 확인
        const pathExists = mapData.advancedCurveList.some((curve) => {
          const startName = curve.startPos.instanceName;
          const endName = curve.endPos.instanceName;
          return (
            (startName === pathAddStart.instanceName &&
              endName === selectedStation.instanceName) ||
            (startName === selectedStation.instanceName &&
              endName === pathAddStart.instanceName)
          );
        });
        if (pathExists) {
          alert("이미 패스가 존재합니다.");
        } else {
          // App에서 전달받은 함수로 패스 추가
          onAddPathFromContext(pathAddStart, selectedStation);
        }
        // 패스 추가 모드 종료 및 상태 초기화
        setIsPathAdding(false);
        setPathAddStart(null);
        setPathPreviewPos(null);
        canvasRef.current.style.cursor = "default";
        return;
      } else {
        // 스테이션이 아닌 곳을 클릭한 경우 아무 동작 없이 미리보기 업데이트만 진행
        return;
      }
    }
    const clicked = checkClickedObject(pos.x, pos.y);
    if (clicked) {
      setClickedObject(clicked);
      if (onObjectClick) onObjectClick(clicked);
      return;
    }
    if (activeMenu === 3) {
      const mapCoord = inverseTransformCoordinates(pos.x, pos.y);
      if (onAddStation) {
        onAddStation(mapCoord.x, mapCoord.y);
      }
      setStationAddInfo(null);
    } else {
      setTooltip(null);
      if (onObjectClick) onObjectClick(null);
      setClickedObject(null);
    }
  };

  const canvasCursorStyle = activeMenu === 3 ? "crosshair" : "default";

  // 우클릭 처리: 스테이션(advancedPoint)인 경우 "해당 위치로 이동" 메뉴를, 경로(advancedCurve)인 경우 "수정" 메뉴를 표시
  // ── 컨텍스트 메뉴 핸들링 수정 ──
  const handleContextMenu = (e) => {
    e.preventDefault();
    const pos = getCanvasMousePos(e);
    const obj = checkClickedObject(pos.x, pos.y);
    if (obj) {
      const clientPos = getClientCoordinates({ x: pos.x, y: pos.y });
      if (obj.type === "advancedPoint") {
        // tooltip에 여러 옵션 추가: "이동"과 "패스 추가"
        setTooltip({
          x: clientPos.x + 2,
          y: clientPos.y + 2,
          object: obj,
          actions: [
            {
              label: "해당 위치로 이동",
              action: () => {
                handleMoveToStation(obj.data);
              },
            },
            {
              label: "패스 추가",
              action: () => {
                startPathAdd(obj.data);
              },
            },
          ],
        });
      } else if (obj.type === "advancedCurve") {
        setTooltip({
          x: clientPos.x + 2,
          y: clientPos.y + 2,
          object: obj,
          actions: [
            {
              label: "수정",
              action: () => {
                setEditingCurve(obj.data);
                setTooltip(null);
              },
            },
          ],
        });
      }
    }
  };
  // ── 신규: 스테이션에서 패스 추가 모드 시작 함수 ──
  const startPathAdd = (station) => {
    setIsPathAdding(true);
    setPathAddStart(station);
    setTooltip(null);
    // 커서 변경: plus 모양을 원한다면 커스텀 커서 이미지 사용 가능 (여기선 crosshair로 대체)
    canvasRef.current.style.cursor = "crosshair";
  };

  // 스테이션 우클릭 시 "해당 위치로 이동" 액션 처리
  const handleMoveToStation = (station) => {
    setTooltip(null);

    // 1) 전송할 JSON 데이터 생성 (id: 대상 스테이션, source_id: "SELF_POSITION")
    const requestData = {
      id: station.instanceName, // 예: "LM3"
      source_id: "SELF_POSITION", // 출발 지점은 현재 로봇 위치
    };
    console.log(requestData);

    // 2) JSON → UTF-8 직렬화
    const jsonStr = JSON.stringify(requestData);
    const encoder = new TextEncoder();
    const body = encoder.encode(jsonStr); // 데이터 영역

    // 3) 헤더(16바이트) 생성
    //    - ID(3051 = 0x0BEB)
    //    - 길이(body.length) 빅엔디안 표기
    //    - 기타 고정 필드
    const header = new Uint8Array(16);
    header[0] = 0x5a; // 시작 바이트
    header[1] = 0x01;
    header[2] = 0x00;
    header[3] = 0x01;
    // 데이터 길이(4~7)
    header[4] = (body.length >> 24) & 0xff;
    header[5] = (body.length >> 16) & 0xff;
    header[6] = (body.length >> 8) & 0xff;
    header[7] = body.length & 0xff;
    // API ID (8~9) → 0x0B EB (3051)
    header[8] = 0x0b;
    header[9] = 0xeb;
    // 나머지 10~15는 0
    // 4) 헤더 + 데이터 영역 합치기
    const message = new Uint8Array(header.length + body.length);
    message.set(header, 0);
    message.set(body, header.length);

    // 5) TCP 전송 (포트 19206)
    //    - 실제 구현은 Electron Main에서 socket.send(...) 하도록 래핑
    window.electronAPI.sendTcpRequest2(amrIP, 19206, message);
  };

  // 편집 모드에서 제어 핸들 드래그 처리
  const handleMouseDown = (e) => {
    const pos = getCanvasMousePos(e);
    if (editingCurve) {
      const handleRadius = 5;
      const h1 = transformCoordinates(
        editingCurve.controlPos1.x,
        editingCurve.controlPos1.y
      );
      const h2 = transformCoordinates(
        editingCurve.controlPos2.x,
        editingCurve.controlPos2.y
      );
      if (Math.hypot(pos.x - h1.x, pos.y - h1.y) < handleRadius) {
        setDraggingHandle("control1");
        setLastMousePos(pos);
        return;
      }
      if (Math.hypot(pos.x - h2.x, pos.y - h2.y) < handleRadius) {
        setDraggingHandle("control2");
        setLastMousePos(pos);
        return;
      }
    }
    setIsDragging(true);
    setLastMousePos(pos);
  };

  const handleMouseMove = (e) => {
    const pos = getCanvasMousePos(e);
    if (isPathAdding) {
      setPathPreviewPos(pos);
    }
    if (activeMenu === 3) {
      const mapCoord = inverseTransformCoordinates(pos.x, pos.y);
      setStationAddInfo({
        clientPos: { x: e.clientX, y: e.clientY },
        mapCoord: mapCoord,
      });
      return;
    } else {
      if (stationAddInfo) setStationAddInfo(null);
    }
    if (draggingHandle && editingCurve) {
      const sensitivity = 1.0;
      const deltaScreen = {
        x: pos.x - lastMousePos.x,
        y: pos.y - lastMousePos.y,
      };
      const deltaMap = {
        x: (deltaScreen.x / scale) * sensitivity,
        y: (deltaScreen.y / scale) * sensitivity,
      };
      if (draggingHandle === "control1") {
        editingCurve.controlPos1.x += deltaMap.x;
        editingCurve.controlPos1.y -= deltaMap.y;
      } else if (draggingHandle === "control2") {
        editingCurve.controlPos2.x += deltaMap.x;
        editingCurve.controlPos2.y -= deltaMap.y;
      }
      setEditingCurve({ ...editingCurve });
      setLastMousePos(pos);
      return;
    }
    setHoveredObject(() => {
      let hovered = null;
      (mapData.advancedPointList || []).forEach((station) => {
        const screenPos = transformCoordinates(station.pos.x, station.pos.y);
        if (Math.hypot(pos.x - screenPos.x, pos.y - screenPos.y) < 15)
          hovered = { type: "advancedPoint", data: station };
      });
      if (!hovered) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        (mapData.advancedCurveList || []).forEach((curve) => {
          const start = transformCoordinates(
            curve.startPos.pos.x,
            curve.startPos.pos.y
          );
          const c1 = transformCoordinates(
            curve.controlPos1.x,
            curve.controlPos1.y
          );
          const c2 = transformCoordinates(
            curve.controlPos2.x,
            curve.controlPos2.y
          );
          const end = transformCoordinates(
            curve.endPos.pos.x,
            curve.endPos.pos.y
          );
          const path = new Path2D();
          path.moveTo(start.x, start.y);
          path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
          ctx.save();
          ctx.lineWidth = 10;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          if (ctx.isPointInStroke(path, pos.x, pos.y))
            hovered = { type: "advancedCurve", data: curve };
          ctx.restore();
        });
      }
      return hovered;
    });
    if (isDragging) {
      const dx = pos.x - lastMousePos.x;
      const dy = pos.y - lastMousePos.y;
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos(pos);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggingHandle(null);
    if (editingCurve && onMapDataUpdate) {
      const updatedMapData = {
        ...mapData,
        advancedCurveList: mapData.advancedCurveList.map((curve) =>
          curve.instanceName === editingCurve.instanceName
            ? editingCurve
            : curve
        ),
      };
      onMapDataUpdate(updatedMapData);
    }
    setEditingCurve(null);
  };

  // 마우스 휠 줌
  const handleWheel = (e) => {
    e.preventDefault();
    const { width, height } = canvasSize;
    const { x: mouseX, y: mouseY } = getCanvasMousePos(e);
    const zoomFactor = 1.1;
    const ratioX = (mouseX - offset.x) / (width * scale);
    const ratioY = (mouseY - offset.y) / (height * scale);
    const realMapX =
      ratioX * (maxPos.current.x - minPos.current.x) + minPos.current.x;
    const realMapY =
      ratioY * (maxPos.current.y - minPos.current.y) + minPos.current.y;
    let newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
    newScale = Math.max(0.05, Math.min(newScale, 200));
    setScale(newScale);
    const newRatioX =
      (realMapX - minPos.current.x) / (maxPos.current.x - minPos.current.x);
    const newRatioY =
      (realMapY - minPos.current.y) / (maxPos.current.y - minPos.current.y);
    setOffset({
      x: mouseX - newRatioX * (width * newScale),
      y: mouseY - newRatioY * (height * newScale),
    });
  };

  // mapData가 바뀔 때, 클릭된 객체를 최신 데이터로 업데이트
  useEffect(() => {
    if (clickedObject) {
      let updatedObj = null;
      if (clickedObject.type === "advancedPoint") {
        updatedObj = mapData.advancedPointList.find(
          (point) => point.instanceName === clickedObject.data.instanceName
        );
        if (updatedObj) {
          setClickedObject({ type: "advancedPoint", data: updatedObj });
        }
      } else if (clickedObject.type === "advancedCurve") {
        updatedObj = mapData.advancedCurveList.find(
          (curve) => curve.instanceName === clickedObject.data.instanceName
        );
        if (updatedObj) {
          setClickedObject({ type: "advancedCurve", data: updatedObj });
        }
      }
    }
  }, [mapData]);

  // 그리기 로직
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvasSize;
    ctx.clearRect(0, 0, width, height);

    // normalPosList: 검은 점들
    ctx.fillStyle = "black";
    (mapData.normalPosList || []).forEach((pos) => {
      const { x, y } = transformCoordinates(pos.x, pos.y);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    });

    // advancedLineList: 분홍 선들
    ctx.strokeStyle = "pink";
    ctx.lineWidth = 1;
    (mapData.advancedLineList || []).forEach((lineData) => {
      const start = transformCoordinates(
        lineData.line.startPos.x,
        lineData.line.startPos.y
      );
      const end = transformCoordinates(
        lineData.line.endPos.x,
        lineData.line.endPos.y
      );
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    });

    // advancedCurveList: 베지어 곡선 그리기
    ctx.lineWidth = 2;
    (mapData.advancedCurveList || []).forEach((curveData) => {
      const currentCurve =
        editingCurve && editingCurve.instanceName === curveData.instanceName
          ? editingCurve
          : curveData;
      const start = transformCoordinates(
        currentCurve.startPos.pos.x,
        currentCurve.startPos.pos.y
      );
      const c1 = transformCoordinates(
        currentCurve.controlPos1.x,
        currentCurve.controlPos1.y
      );
      const c2 = transformCoordinates(
        currentCurve.controlPos2.x,
        currentCurve.controlPos2.y
      );
      const end = transformCoordinates(
        currentCurve.endPos.pos.x,
        currentCurve.endPos.pos.y
      );
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
      ctx.strokeStyle = "red";
      ctx.stroke();

      // 편집 중인 곡선이면 제어 핸들 그리기
      if (
        editingCurve &&
        editingCurve.instanceName === curveData.instanceName
      ) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0,0,255,0.5)";
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(c1.x, c1.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.stroke();

        const handleRadius = 5;
        ctx.beginPath();
        ctx.arc(c1.x, c1.y, handleRadius, 0, Math.PI * 2);
        ctx.fillStyle = "blue";
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c2.x, c2.y, handleRadius, 0, Math.PI * 2);
        ctx.fillStyle = "blue";
        ctx.fill();
        ctx.stroke();
      }
    });

    // Station(advancedPointList) 마커 그리기 및 이름, 방향 아이콘 표시
    (mapData.advancedPointList || []).forEach((station) => {
      // 스테이션 위치 (transformCoordinates 사용)
      const { x, y } = transformCoordinates(station.pos.x, station.pos.y);
      const dir = station.dir;

      // 마커 크기 계산 (localStorage 값에 따라 조정)
      let markerScreenWidth = 80,
        markerScreenHeight = 120;
      const amrWidthStr = localStorage.getItem("amrWidth");
      const amrHeightStr = localStorage.getItem("amrHeight");
      if (amrWidthStr && amrHeightStr) {
        const amrWidth_m = parseFloat(amrWidthStr) / 1000;
        const amrHeight_m = parseFloat(amrHeightStr) / 1000;
        markerScreenWidth = amrHeight_m * scale;
        markerScreenHeight = amrWidth_m * scale;
      } else {
        markerScreenWidth = 80 * (scale / 40);
        markerScreenHeight = 120 * (scale / 40);
      }

      // 1. 스테이션 사각형 테두리 그리기
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-dir - Math.PI / 2);
      ctx.strokeStyle = "orange";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        -markerScreenWidth / 2,
        -markerScreenHeight / 2,
        markerScreenWidth,
        markerScreenHeight
      );
      ctx.restore();

      // 2. 스테이션 방향 아이콘(정삼각형) 그리기
      ctx.save();
      const centerRadius = 2 * (scale / 40);
      const margin = 5 * (scale / 40);
      const circleDistance = centerRadius + margin; // station 중심에서 원까지의 오프셋
      ctx.translate(
        x + circleDistance * Math.cos(station.dir),
        y - circleDistance * Math.sin(station.dir)
      );
      // 작은 원 그리기: markerScreenWidth의 1/12 크기로 설정 (원하는 크기로 조정 가능)
      const circleRadius = markerScreenWidth / 24;
      ctx.beginPath();
      ctx.arc(0, 0, circleRadius, 0, 2 * Math.PI);
      ctx.fillStyle = "orange";
      ctx.fill();
      ctx.restore();

      // 3. 스테이션 중앙 원 그리기
      ctx.fillStyle = "orange";
      ctx.beginPath();
      ctx.arc(x, y, centerRadius, 0, 2 * Math.PI);
      ctx.fill();

      // 4. 스테이션 이름을 중앙 원 바로 아래에 표시
      ctx.fillStyle = "black";
      ctx.font = `${4 * (scale / 40)}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText(station.instanceName, x, y + centerRadius + 16);
    });

    // 원점 (0,0) 표시
    // 원점 (0,0) 및 x, y 축 표시
    const originScreen = transformCoordinates(0, 0);
    ctx.save();
    ctx.strokeStyle = "green";
    ctx.lineWidth = 2;

    // X축: 원점에서 오른쪽 50픽셀까지 선 그리기
    ctx.beginPath();
    ctx.moveTo(originScreen.x, originScreen.y);
    ctx.lineTo(originScreen.x + 50, originScreen.y);
    ctx.stroke();

    // X축 화살표 머리
    ctx.beginPath();
    ctx.moveTo(originScreen.x + 50, originScreen.y);
    ctx.lineTo(originScreen.x + 45, originScreen.y - 5);
    ctx.lineTo(originScreen.x + 45, originScreen.y + 5);
    ctx.closePath();
    ctx.fillStyle = "green";
    ctx.fill();

    // Y축: 원점에서 위쪽 50픽셀까지 선 그리기
    ctx.beginPath();
    ctx.moveTo(originScreen.x, originScreen.y);
    ctx.lineTo(originScreen.x, originScreen.y - 50);
    ctx.stroke();

    // Y축 화살표 머리
    ctx.beginPath();
    ctx.moveTo(originScreen.x, originScreen.y - 50);
    ctx.lineTo(originScreen.x - 5, originScreen.y - 45);
    ctx.lineTo(originScreen.x + 5, originScreen.y - 45);
    ctx.closePath();
    ctx.fill();

    // 축 레이블
    ctx.font = "14px Arial";
    ctx.fillText("X", originScreen.x + 55, originScreen.y);
    ctx.fillText("Y", originScreen.x, originScreen.y - 55);
    ctx.restore();

    // Hover 및 클릭된 오브젝트 하이라이트
    const highlightObject = (object) => {
      if (!object) return;
      if (object.type === "advancedPoint") {
        const { x, y } = transformCoordinates(
          object.data.pos.x,
          object.data.pos.y
        );
        const dir = object.data.dir;
        const amrWidthStr = localStorage.getItem("amrWidth");
        const amrHeightStr = localStorage.getItem("amrHeight");
        let markerScreenWidth = 80,
          markerScreenHeight = 120;
        if (amrWidthStr && amrHeightStr) {
          const amrWidth_m = parseFloat(amrWidthStr) / 1000;
          const amrHeight_m = parseFloat(amrHeightStr) / 1000;
          markerScreenWidth = amrWidth_m * scale;
          markerScreenHeight = amrHeight_m * scale;
        } else {
          markerScreenWidth = 80 * (scale / 40);
          markerScreenHeight = 120 * (scale / 40);
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-dir);
        ctx.shadowColor = "rgba(255, 165, 0, 0.8)";
        ctx.shadowBlur = 25;
        ctx.strokeStyle = "orange";
        ctx.lineWidth = 4;
        ctx.strokeRect(
          -markerScreenWidth / 2,
          -markerScreenHeight / 2,
          markerScreenWidth,
          markerScreenHeight
        );
        ctx.restore();
      } else if (object.type === "advancedCurve") {
        const curve = object.data;
        const start = transformCoordinates(
          curve.startPos.pos.x,
          curve.startPos.pos.y
        );
        const c1 = transformCoordinates(
          curve.controlPos1.x,
          curve.controlPos1.y
        );
        const c2 = transformCoordinates(
          curve.controlPos2.x,
          curve.controlPos2.y
        );
        const end = transformCoordinates(
          curve.endPos.pos.x,
          curve.endPos.pos.y
        );
        ctx.save();
        ctx.shadowColor = "rgba(255, 5, 0, 0.8)";
        ctx.shadowBlur = 20;
        ctx.strokeStyle = "red";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
        ctx.stroke();
        ctx.restore();
      }
    };

    highlightObject(hoveredObject);
    highlightObject(clickedObject);

    // AMR 위치 (이미지) 그리기
    if (amrPosition && activeMenu === 0) {
      console.log(amrPosition);
      const amrImageData = localStorage.getItem("amrImage");
      const amrWidthStr = localStorage.getItem("amrWidth");
      const amrHeightStr = localStorage.getItem("amrHeight");
      if (amrImageData && amrWidthStr && amrHeightStr) {
        const amrWidth_m = parseFloat(amrHeightStr) / 1000;
        const amrHeight_m = parseFloat(amrWidthStr) / 1000;
        const screenWidth = amrWidth_m * scale;
        const screenHeight = amrHeight_m * scale;
        const posScreen = transformCoordinates(amrPosition.x, amrPosition.y);
        const amrImg = new Image();
        amrImg.src = amrImageData;
        ctx.save();
        ctx.translate(posScreen.x, posScreen.y);
        ctx.rotate(-1 * (amrPosition.angle + 1.5 * Math.PI));
        ctx.drawImage(
          amrImg,
          -screenWidth / 2,
          -screenHeight / 2,
          screenWidth,
          screenHeight
        );
        ctx.restore();
      }
    }
    // 패스 추가 모드 시, 미리보기 선 그리기
    if (isPathAdding && pathAddStart && pathPreviewPos) {
      const startScreen = transformCoordinates(
        pathAddStart.pos.x,
        pathAddStart.pos.y
      );
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startScreen.x, startScreen.y);
      ctx.lineTo(pathPreviewPos.x, pathPreviewPos.y);
      ctx.strokeStyle = "rgba(0, 0, 255, 0.5)"; // 연한 파란색
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]); // 점선 효과
      ctx.stroke();
      ctx.restore();
    }
    // 레이저 데이터 그리기 (laserData가 있으면)
    if (laserData && laserData.lasers && amrPosition && activeMenu === 0) {
      console.log("canvas laser");
      console.log(laserData);
      // AMR 위치를 기준으로 상대 좌표로 변환합니다.
      const amrScreen = transformCoordinates(amrPosition.x, amrPosition.y);
      // 예를 들어, FrontLiDAR 데이터의 beams 그리기
      const frontLaser = laserData.lasers[0];
      if (frontLaser && frontLaser.beams) {
        frontLaser.beams.forEach((beam) => {
          if (beam.valid) {
            // 각 beam의 angle과 dist를 사용하여 좌표 계산 (각도는 degree 단위)
            const angleRad = beam.angle * (Math.PI / 180);
            const beamX = amrScreen.x + beam.dist * scale * Math.cos(angleRad);
            const beamY = amrScreen.y - beam.dist * scale * Math.sin(angleRad);

            // 로봇 중심과 beam 사이에 연하고 반투명한 선 그리기
            ctx.beginPath();
            ctx.moveTo(amrScreen.x, amrScreen.y);
            ctx.lineTo(beamX, beamY);
            ctx.strokeStyle = "rgba(0, 255, 255, 0.3)"; // 반투명 cyan
            ctx.lineWidth = 1;
            ctx.stroke();

            // beam 점 그리기 (작은 원)
            ctx.beginPath();
            ctx.arc(beamX, beamY, 2, 0, 2 * Math.PI); // 반지름 6 (필요시 조절)
            ctx.fillStyle = "rgba(0, 255, 255, 0.8)"; // neon cyan
            ctx.fill();
          }
        });
      }
    }
  }, [
    mapData,
    scale,
    offset,
    canvasSize,
    hoveredObject,
    clickedObject,
    amrPosition,
    editingCurve,
    isPathAdding, // 추가
    pathAddStart, // 추가
    pathPreviewPos, // 추가
    laserData,
  ]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          background: "#fff",
          cursor: canvasCursorStyle,
        }}
        onClick={handleCanvasClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {/* tooltip 렌더링 */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y,
            background: "white",
            padding: "8px",
            borderRadius: "8px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
            zIndex: 1000,
          }}
        >
          {tooltip.actions &&
            tooltip.actions.map((item, idx) => (
              <div
                key={idx}
                style={{ cursor: "pointer", padding: "4px 8px" }}
                onClick={() => {
                  item.action();
                }}
              >
                {item.label}
              </div>
            ))}
        </div>
      )}
      {stationAddInfo && activeMenu === 3 && (
        <div
          style={{
            position: "fixed",
            left: stationAddInfo.clientPos.x + 10,
            top: stationAddInfo.clientPos.y + 10,
            background: "white",
            border: "1px solid black",
            padding: "4px 8px",
            borderRadius: "4px",
            zIndex: 1000,
            fontSize: "12px",
          }}
        >
          {`X: ${stationAddInfo.mapCoord.x.toFixed(
            2
          )}, Y: ${stationAddInfo.mapCoord.y.toFixed(2)}`}
        </div>
      )}
    </div>
  );
};

export default MapCanvas;
