import React, { useRef, useEffect, useState } from "react";

const MapCanvas = ({ mapData, onObjectClick, activeMenu, amrPosition }) => {
  const canvasRef = useRef(null);

  // 확대/축소 비율 & 오프셋 (캔버스 내부 좌표)
  const [scale, setScale] = useState(40);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // Hover, 클릭된 오브젝트, tooltip 상태
  const [hoveredObject, setHoveredObject] = useState(null);
  const [clickedObject, setClickedObject] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  // 맵 좌표 영역 (기본값)
  const minPos = useRef(
    mapData.header ? mapData.header.minPos : { x: 0, y: 0 }
  );
  const maxPos = useRef(
    mapData.header ? mapData.header.maxPos : { x: 100, y: 100 }
  );

  // Canvas 크기
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

  // 초기 mapData 로드 시 한 번만 (0,0)이 화면 중앙에 오도록 offset 설정
  useEffect(() => {
    if (mapData && mapData.header && canvasSize.width && canvasSize.height) {
      const mapHeight = maxPos.current.y - minPos.current.y;

      setOffset({
        x: canvasSize.width / 2 + minPos.current.x * scale,
        y:
          canvasSize.height / 2 -
          (1 + minPos.current.y / mapHeight) * (mapHeight * scale),
      });
    }
  }, [mapData]);

  // 좌표 변환 함수 (세로 반전 적용, 캔버스 내부 좌표)
  const transformCoordinates = (mapX, mapY) => {
    const { width, height } = canvasSize;
    const mapWidth = maxPos.current.x - minPos.current.x;
    const mapHeight = maxPos.current.y - minPos.current.y;
    const screenX = (mapX - minPos.current.x) * scale + offset.x;
    const screenY =
      (1 - (mapY - minPos.current.y) / mapHeight) * (mapHeight * scale) +
      offset.y;
    return { x: screenX, y: screenY };
  };

  // canvas 내 좌표를 클라이언트 좌표로 변환
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
      const dist = Math.hypot(mouseX - screenPos.x, mouseY - screenPos.y);
      if (dist < 15) found = { type: "advancedPoint", data: station };
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
        const hit = ctx.isPointInStroke(path, mouseX, mouseY);
        ctx.restore();
        if (hit) found = { type: "advancedCurve", data: curve };
      });
    }
    return found;
  };

  // 왼쪽 클릭 핸들러: 빈 공간 클릭 시 InfoPanel 제거
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

  // 우클릭 핸들러: 우클릭한 오브젝트 기준으로 tooltip 위치 설정 (클라이언트 좌표 기준)
  const handleContextMenu = (e) => {
    e.preventDefault();
    const pos = getCanvasMousePos(e);
    const obj = checkClickedObject(pos.x, pos.y);
    if (obj) {
      let refPoint = null;
      if (obj.type === "advancedPoint") {
        refPoint = transformCoordinates(obj.data.pos.x, obj.data.pos.y);
      } else if (obj.type === "advancedCurve") {
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
        const midX =
          mt ** 3 * start.x +
          3 * mt ** 2 * t * c1.x +
          3 * mt * t ** 2 * c2.x +
          t ** 3 * end.x;
        const midY =
          mt ** 3 * start.y +
          3 * mt ** 2 * t * c1.y +
          3 * mt * t ** 2 * c2.y +
          t ** 3 * end.y;
        refPoint = { x: midX, y: midY };
      }
      // canvas 내부 좌표 refPoint를 클라이언트 좌표로 변환
      const clientPos = getClientCoordinates(refPoint);
      // tooltip을 클라이언트 좌표 기준으로 아주 근접하게 (+2px)
      setTooltip({ x: clientPos.x + 2, y: clientPos.y + 2, object: obj });
    }
  };

  // 드래그 처리
  const handleMouseDown = (e) => {
    setIsDragging(true);
    const pos = getCanvasMousePos(e);
    setLastMousePos(pos);
  };

  const handleMouseMove = (e) => {
    const pos = getCanvasMousePos(e);
    const dx = pos.x - lastMousePos.x;
    const dy = pos.y - lastMousePos.y;
    setHoveredObject(() => {
      let hovered = null;
      (mapData.advancedPointList || []).forEach((station) => {
        const screenPos = transformCoordinates(station.pos.x, station.pos.y);
        const dist = Math.hypot(pos.x - screenPos.x, pos.y - screenPos.y);
        if (dist < 15) hovered = { type: "advancedPoint", data: station };
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
          const hit = ctx.isPointInStroke(path, pos.x, pos.y);
          ctx.restore();
          if (hit) hovered = { type: "advancedCurve", data: curve };
        });
      }
      return hovered;
    });
    if (isDragging) {
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos(pos);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 그리기 로직
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvasSize;
    ctx.clearRect(0, 0, width, height);

    // normalPosList: 검정 점들
    ctx.fillStyle = "black";
    (mapData.normalPosList || []).forEach((pos) => {
      const { x, y } = transformCoordinates(pos.x, pos.y);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    });

    // advancedLineList: 분홍 선 (transformCoordinates 사용)
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

    // advancedCurveList: 빨간 베지어 곡선 및 방향 표시
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    (mapData.advancedCurveList || []).forEach((curveData) => {
      const start = transformCoordinates(
        curveData.startPos.pos.x,
        curveData.startPos.pos.y
      );
      const c1 = transformCoordinates(
        curveData.controlPos1.x,
        curveData.controlPos1.y
      );
      const c2 = transformCoordinates(
        curveData.controlPos2.x,
        curveData.controlPos2.y
      );
      const end = transformCoordinates(
        curveData.endPos.pos.x,
        curveData.endPos.pos.y
      );
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
      ctx.stroke();

      // 방향 표시용 삼각형 (t = 0.5)
      const t = 0.5,
        mt = 1 - t;
      const S0 = start,
        S1 = c1,
        S2 = c2,
        S3 = end;
      const midX =
        mt ** 3 * S0.x +
        3 * mt ** 2 * t * S1.x +
        3 * mt * t ** 2 * S2.x +
        t ** 3 * S3.x;
      const midY =
        mt ** 3 * S0.y +
        3 * mt ** 2 * t * S1.y +
        3 * mt * t ** 2 * S2.y +
        t ** 3 * S3.y;
      const dx =
        3 * mt ** 2 * (S1.x - S0.x) +
        6 * mt * t * (S2.x - S1.x) +
        3 * t ** 2 * (S3.x - S2.x);
      const dy =
        3 * mt ** 2 * (S1.y - S0.y) +
        6 * mt * t * (S2.y - S1.y) +
        3 * t ** 2 * (S3.y - S2.y);
      const angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(midX, midY);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-4, 6);
      ctx.lineTo(4, 6);
      ctx.closePath();
      ctx.fillStyle = "red";
      ctx.fill();
      ctx.restore();
    });

    // advancedPointList: 스테이션 그리기
    (mapData.advancedPointList || []).forEach((station) => {
      const { x, y } = transformCoordinates(station.pos.x, station.pos.y);
      const dir = station.dir;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(dir);
      ctx.strokeStyle = "orange";
      ctx.lineWidth = 2;
      ctx.strokeRect(-40, -60, 80, 120);
      ctx.restore();

      ctx.fillStyle = "orange";
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fill();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(dir);
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(-10, -20);
      ctx.lineTo(10, -20);
      ctx.closePath();
      ctx.fillStyle = "orange";
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "black";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText(station.instanceName, x, y + 100);
    });

    // 원점 (0,0) 표시: 녹색 십자와 "(0, 0)" 텍스트
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

    // Hover 및 클릭된 오브젝트 강조
    const highlightObject = (object) => {
      if (!object) return;
      const ctx = canvas.getContext("2d");
      if (object.type === "advancedPoint") {
        const { x, y } = transformCoordinates(
          object.data.pos.x,
          object.data.pos.y
        );
        const dir = object.data.dir;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(dir);
        ctx.shadowColor = "rgba(255, 165, 0, 0.8)";
        ctx.shadowBlur = 25;
        ctx.strokeStyle = "orange";
        ctx.lineWidth = 4;
        ctx.strokeRect(-40, -60, 80, 120);
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

    // AMR 위치 (삼각형) 그리기
    if (amrPosition) {
      const { x, y, angle } = amrPosition;
      const { x: screenX, y: screenY } = transformCoordinates(x, y);
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(-10, 10);
      ctx.lineTo(10, 10);
      ctx.closePath();
      ctx.fillStyle = "blue";
      ctx.fill();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }, [
    mapData,
    scale,
    offset,
    canvasSize,
    hoveredObject,
    clickedObject,
    amrPosition,
  ]);

  // 마우스 휠 줌 (기존 로직 유지)
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
            background: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "5px",
            borderRadius: "4px",
            zIndex: 1000,
          }}
          onClick={() => setTooltip(null)}
        >
          <div>옵션 메뉴</div>
          <div style={{ cursor: "pointer" }}>수정</div>
          <div style={{ cursor: "pointer" }}>삭제</div>
        </div>
      )}
    </div>
  );
};

export default MapCanvas;
