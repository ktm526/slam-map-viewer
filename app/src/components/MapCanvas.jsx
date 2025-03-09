import React, { useRef, useEffect, useState } from "react";

const MapCanvas = ({
  mapData,
  onObjectClick,
  onMapDataUpdate,
  activeMenu,
  amrPosition,
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

  // 맵 좌표 영역 (map unit 1 = 1m로 가정)
  const minPos = useRef(
    mapData.header ? mapData.header.minPos : { x: 0, y: 0 }
  );
  const maxPos = useRef(
    mapData.header ? mapData.header.maxPos : { x: 100, y: 100 }
  );

  // Canvas 크기 상태
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
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
  // map unit 1을 1m로 취급합니다.
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

  // 왼쪽 클릭: 빈 공간 클릭 시 InfoPanel 제거
  const handleCanvasClick = (e) => {
    e.preventDefault();
    if (tooltip) {
      setTooltip(null);
      if (onObjectClick) onObjectClick(null);
      setClickedObject(null);
      return;
    }
    const pos = getCanvasMousePos(e);
    const clicked = checkClickedObject(pos.x, pos.y);
    if (!clicked) {
      setTooltip(null);
      if (onObjectClick) onObjectClick(null);
      setClickedObject(null);
      return;
    }
    setClickedObject(clicked);
    if (onObjectClick) onObjectClick(clicked);
  };

  // 우클릭: 애플 스타일의 메뉴 표시 (수정/삭제)
  const handleContextMenu = (e) => {
    e.preventDefault();
    const pos = getCanvasMousePos(e);
    const obj = checkClickedObject(pos.x, pos.y);
    if (obj) {
      let refPoint = null;
      if (obj.type === "advancedPoint")
        refPoint = transformCoordinates(obj.data.pos.x, obj.data.pos.y);
      else if (obj.type === "advancedCurve") {
        const start = transformCoordinates(
          obj.data.startPos.pos.x,
          obj.data.startPos.pos.y
        );
        const c1 = transformCoordinates(
          obj.data.controlPos1.x,
          obj.data.controlPos1.y
        );
        const c2 = transformCoordinates(
          obj.data.controlPos2.x,
          obj.data.controlPos2.y
        );
        const end = transformCoordinates(
          obj.data.endPos.pos.x,
          obj.data.endPos.pos.y
        );
        const t = 0.5,
          mt = 1 - t;
        refPoint = {
          x:
            mt ** 3 * start.x +
            3 * mt ** 2 * t * c1.x +
            3 * mt * t ** 2 * c2.x +
            t ** 3 * end.x,
          y:
            mt ** 3 * start.y +
            3 * mt ** 2 * t * c1.y +
            3 * mt * t ** 2 * c2.y +
            t ** 3 * end.y,
        };
      }
      const clientPos = getClientCoordinates(refPoint);
      setTooltip({ x: clientPos.x + 2, y: clientPos.y + 2, object: obj });
    }
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
    // 편집 모드: 제어 핸들 드래그 처리
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

    // Hover 체크
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
    newScale = Math.max(0.05, Math.min(newScale, 100));
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

    // Station(advancedPointList) 마커 그리기
    (mapData.advancedPointList || []).forEach((station) => {
      const { x, y } = transformCoordinates(station.pos.x, station.pos.y);
      const dir = station.dir; // dir은 라디안 단위입니다.
      // 로컬 스토리지에서 AMR 사이즈 읽기 (없으면 기본값 사용)
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
      // station 사각형 그리기
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(dir);
      ctx.strokeStyle = "orange";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        -markerScreenWidth / 2,
        -markerScreenHeight / 2,
        markerScreenWidth,
        markerScreenHeight
      );
      // 방향을 나타내는 세모(arrow)를 주황색으로 추가
      ctx.fillStyle = "orange";
      ctx.beginPath();
      // 세모의 tip은 사각형 상단 중앙에 위치 (Y: -markerScreenHeight/2)
      const arrowTipY = -markerScreenHeight / 2;
      // 세모 크기는 station 크기에 비례 (임의 조정)
      const arrowHeight = 10 * (scale / 40);
      const arrowWidth = markerScreenWidth / 4;
      ctx.moveTo(0, arrowTipY);
      ctx.lineTo(-arrowWidth / 2, arrowTipY + arrowHeight);
      ctx.lineTo(arrowWidth / 2, arrowTipY + arrowHeight);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // station 중심 표시 (작은 원, scale 적용)
      ctx.fillStyle = "orange";
      ctx.beginPath();
      const centerRadius = 6 * (scale / 40);
      ctx.arc(x, y, centerRadius, 0, 2 * Math.PI);
      ctx.fill();

      // station 이름 표시 (사각형 아래)
      ctx.fillStyle = "black";
      ctx.font = `${20 * (scale / 40)}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText(
        station.instanceName,
        x,
        y + markerScreenHeight / 2 + 20 * (scale / 40)
      );
    });

    // 원점 (0,0) 표시
    const originScreen = transformCoordinates(0, 0);
    ctx.save();
    ctx.strokeStyle = "green";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(originScreen.x - 5, originScreen.y);
    ctx.lineTo(originScreen.x + 5, originScreen.y);
    ctx.moveTo(originScreen.x, originScreen.y - 5);
    ctx.lineTo(originScreen.x, originScreen.y + 5);
    ctx.stroke();
    ctx.font = "16px Arial";
    ctx.fillStyle = "green";
    ctx.textAlign = "left";
    ctx.fillText("(0, 0)", originScreen.x + 8, originScreen.y - 8);
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
        // station 마커 크기 계산 (위와 동일)
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
        ctx.rotate(dir);
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
    if (amrPosition) {
      const amrImageData = localStorage.getItem("amrImage");
      const amrWidthStr = localStorage.getItem("amrWidth");
      const amrHeightStr = localStorage.getItem("amrHeight");
      if (amrImageData && amrWidthStr && amrHeightStr) {
        const amrWidth_m = parseFloat(amrWidthStr) / 1000;
        const amrHeight_m = parseFloat(amrHeightStr) / 1000;
        const screenWidth = amrWidth_m * scale;
        const screenHeight = amrHeight_m * scale;
        const posScreen = transformCoordinates(amrPosition.x, amrPosition.y);
        const amrImg = new Image();
        amrImg.src = amrImageData;
        ctx.save();
        ctx.translate(posScreen.x, posScreen.y);
        ctx.rotate(amrPosition.angle);
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
  }, [
    mapData,
    scale,
    offset,
    canvasSize,
    hoveredObject,
    clickedObject,
    amrPosition,
    editingCurve,
  ]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", background: "#fff" }}
        onClick={handleCanvasClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y,
            background: "white",
            color: "#333",
            padding: "8px",
            borderRadius: "8px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
            zIndex: 1000,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            fontSize: "14px",
          }}
          onClick={() => setTooltip(null)}
        >
          <div
            style={{ cursor: "pointer", padding: "4px 8px" }}
            onClick={() => {
              if (tooltip.object && tooltip.object.type === "advancedCurve") {
                setEditingCurve(tooltip.object.data);
              }
              setTooltip(null);
            }}
          >
            수정
          </div>
          <div
            style={{
              cursor: "pointer",
              padding: "4px 8px",
              borderTop: "1px solid #ddd",
            }}
          >
            삭제
          </div>
        </div>
      )}
    </div>
  );
};

export default MapCanvas;
