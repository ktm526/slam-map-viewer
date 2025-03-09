import React, { useState, useEffect } from "react";
import "./App.css";
import MenuBar from "./components/MenuBar";
import MapCanvas from "./components/MapCanvas";
import InfoPanel from "./components/InfoPanel";
// Modal 컴포넌트는 스테이션 추가에 사용하지 않으므로 제거합니다.
import PathModal from "./components/PathModal";
import MovementControl from "./components/MovementControl";
import SettingsModal from "./components/SettingsModal";
//import useUdpReceiver from "./utils/useUdpReceiver";

function App() {
  const [activeMenu, setActiveMenu] = useState(null);
  // 스테이션 추가 모달 대신 activeMenu 3을 스테이션 추가 모드로 사용합니다.
  const [isPathModalOpen, setIsPathModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [amrIp, setAmrIp] = useState("");
  const [amrPosition, setAmrPosition] = useState(null); // AMR 위치 상태
  const [robotData, setRobotData] = useState(null);
  const [mapData, setMapData] = useState({
    header: {
      minPos: { x: 0, y: 0 },
      maxPos: { x: 1000, y: 1000 },
    },
    normalPosList: [],
    advancedPointList: [],
    advancedLineList: [],
    advancedCurveList: [],
  });
  const [clickedObject, setClickedObject] = useState(null);

  // 로봇 데이터 업데이트
  useEffect(() => {
    window.electronAPI.onRobotDataUpdate((data) => {
      console.log("Updating robot data in App:", data);
      setRobotData(data);
    });
  }, []);

  // SLAM 데이터 업데이트
  useEffect(() => {
    window.electronAPI.on("slam-data", (data) => {
      console.log("Received SLAM data:", data);
      setMapData((prevData) => ({
        ...prevData,
        normalPosList: data.points || [],
      }));
    });
    return () => {
      window.electronAPI.removeAllListeners("slam-data");
    };
  }, []);

  // AMR 데이터(PushData) 업데이트
  useEffect(() => {
    const handlePushData = (data) => {
      console.log("Received AMR data:", data);
      setAmrPosition({ x: data.x, y: data.y, angle: data.angle });
    };
    window.electronAPI.onPushData(handlePushData);
    return () => {
      window.electronAPI.unsubscribeFromPushData();
    };
  }, []);

  // PushData 구독/해제 함수
  const startPushData = async () => {
    try {
      await window.electronAPI.subscribeToPushData(amrIp, 19301);
      console.log("Subscribed to push data");
    } catch (error) {
      console.error("Error subscribing to push data:", error);
    }
  };

  const stopPushData = async () => {
    try {
      await window.electronAPI.unsubscribeFromPushData();
      console.log("Unsubscribed from push data");
    } catch (error) {
      console.error("Error unsubscribing from push data:", error);
    }
  };

  // 로컬스토리지에 저장된 AMR IP 불러오기
  useEffect(() => {
    const savedAmrIp = localStorage.getItem("amrIp");
    if (savedAmrIp) {
      setAmrIp(savedAmrIp);
    }
  }, []);

  const handleSaveAmrIp = (newIp) => {
    setAmrIp(newIp);
    console.log("Saved AMR IP:", newIp);
    // 필요시 메인 프로세스로 전달하는 로직 추가
  };

  const handleObjectClick = (object) => {
    setClickedObject(object);
  };

  // 경로 추가 함수
  const handleAddPath = (startStation, stopStation) => {
    const newPath = {
      className: "DegenerateBezier",
      instanceName: `${startStation.instanceName}-${stopStation.instanceName}`,
      startPos: {
        instanceName: startStation.instanceName,
        pos: startStation.pos,
      },
      endPos: {
        instanceName: stopStation.instanceName,
        pos: stopStation.pos,
      },
      controlPos1: {
        x: (startStation.pos.x + stopStation.pos.x) / 2,
        y: (startStation.pos.y + stopStation.pos.y) / 2,
      },
      controlPos2: {
        x: (startStation.pos.x + stopStation.pos.x) / 2,
        y: (startStation.pos.y + stopStation.pos.y) / 2,
      },
      property: [
        { key: "direction", type: "int", int32Value: 1 },
        { key: "movestyle", type: "int", int32Value: 0 },
        { key: "maxspeed", type: "double", doubleValue: 0.3 },
        { key: "maxdec", type: "double", doubleValue: 0.3 },
        { key: "maxrot", type: "double", doubleValue: 0 },
        { key: "obsStopDist", type: "double", doubleValue: 0 },
        { key: "obsDecDist", type: "double", doubleValue: 0 },
        { key: "obsExpansion", type: "double", doubleValue: 0 },
        { key: "decObsExpansion", type: "double", doubleValue: 0 },
        { key: "loadMaxSpeed", type: "double", doubleValue: 0 },
        { key: "loadMaxRot", type: "double", doubleValue: 0 },
        { key: "loadObsStopDist", type: "double", doubleValue: 0 },
        { key: "loadObsDecDist", type: "double", doubleValue: 0 },
        { key: "loadObsExpansion", type: "double", doubleValue: 0 },
        { key: "loadDecObsExpansion", type: "double", doubleValue: 0 },
      ],
    };

    setMapData((prevData) => ({
      ...prevData,
      advancedCurveList: [...prevData.advancedCurveList, newPath],
    }));

    alert(`경로가 추가되었습니다: ${newPath.instanceName}`);
    setActiveMenu(null);
  };

  // 객체 업데이트 및 삭제 함수
  const handleObjectUpdate = (updatedObject) => {
    console.log("Updating object:", updatedObject);
    setMapData((prevData) => {
      if (updatedObject.type === "advancedPoint") {
        return {
          ...prevData,
          advancedPointList: prevData.advancedPointList.map((point) =>
            point.instanceName === updatedObject.instanceName
              ? { ...point, ...updatedObject }
              : point
          ),
        };
      } else if (updatedObject.type === "advancedCurve") {
        return {
          ...prevData,
          advancedCurveList: prevData.advancedCurveList.map((curve) =>
            curve.instanceName === updatedObject.instanceName
              ? { ...curve, ...updatedObject }
              : curve
          ),
        };
      }
      return prevData;
    });
  };

  const handleObjectDelete = (object) => {
    console.log("Deleting object:", object);
    if (object.type === "advancedPoint") {
      const stationName = object.data.instanceName;
      setMapData((prevData) => ({
        ...prevData,
        // 해당 스테이션 삭제
        advancedPointList: prevData.advancedPointList.filter(
          (point) => point.instanceName !== stationName
        ),
        // 경로 삭제: startPos 혹은 endPos의 instanceName이 스테이션 이름과 일치하면 삭제
        advancedCurveList: prevData.advancedCurveList.filter(
          (curve) =>
            curve.startPos.instanceName !== stationName &&
            curve.endPos.instanceName !== stationName
        ),
      }));
    } else if (object.type === "advancedCurve") {
      setMapData((prevData) => ({
        ...prevData,
        advancedCurveList: prevData.advancedCurveList.filter(
          (curve) => curve.instanceName !== object.data.instanceName
        ),
      }));
    }
    setClickedObject(null);
  };

  // 스테이션 추가 함수 (마우스 클릭 좌표를 받아서 처리)
  const handleAddStation = (mapX, mapY) => {
    // 기존 스테이션들 중 "LM" 접두어를 가진 숫자 목록 추출
    const usedNumbers = (mapData.advancedPointList || [])
      .map((station) => {
        const match = station.instanceName.match(/^LM(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((n) => n !== null)
      .sort((a, b) => a - b);
    let newNumber = 1;
    for (let num of usedNumbers) {
      if (num === newNumber) newNumber++;
      else break;
    }
    const newName = `LM${newNumber}`;
    const newStation = {
      instanceName: newName,
      pos: { x: mapX, y: mapY },
      dir: 0,
    };

    setMapData((prevData) => ({
      ...prevData,
      advancedPointList: [...prevData.advancedPointList, newStation],
    }));

    alert(`새로운 스테이션이 추가되었습니다: ${newStation.instanceName}`);
    setActiveMenu(null);
  };

  // 메뉴 클릭 핸들러
  const handleMenuClick = (menuIndex) => {
    console.log(`Menu clicked: ${menuIndex}`);
    if (menuIndex === 3) {
      // 스테이션 추가 모드: 모달 대신 activeMenu를 3으로 설정하여 MapCanvas에서 처리
      setActiveMenu(activeMenu === 3 ? null : 3);
    } else if (menuIndex === 2) {
      console.log("Opening Path Modal");
      setIsPathModalOpen(true);
    } else if (menuIndex === 4) {
      setIsSettingsModalOpen(true);
    } else {
      setActiveMenu(menuIndex);
    }
  };

  // PathModal, SettingsModal 닫기 함수
  const closePathModal = () => {
    console.log("Closing Path Modal");
    setIsPathModalOpen(false);
    setActiveMenu(null);
  };

  const closeSettingsModal = () => {
    setIsSettingsModalOpen(false);
    setActiveMenu(null);
  };

  // 파일 오픈 시 mapData 업데이트
  useEffect(() => {
    const handleFileOpened = (data) => {
      setMapData(data);
    };
    window.electronAPI.onFileOpened(handleFileOpened);
    return () => {
      window.electronAPI.removeFileOpenedListener();
    };
  }, []);

  // 메인 프로세스에 mapData 제공
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.handleGetMapData) {
      console.log("Registering get-map-data handler");
      window.electronAPI.handleGetMapData(() => mapData);
    } else {
      console.warn("electronAPI.handleGetMapData is not available");
    }
  }, [mapData]);

  // 외부에서 mapData 업데이트 수신
  useEffect(() => {
    const handleMapDataUpdated = (newMapData) => {
      console.log("Received newMapData in App.js:", newMapData);
      if (!newMapData) {
        console.error("newMapData is undefined in App.js");
        return;
      }
      setMapData(newMapData);
    };
    window.electronAPI.on("map-data-updated", handleMapDataUpdated);
    return () => {
      window.electronAPI.removeListener(
        "map-data-updated",
        handleMapDataUpdated
      );
    };
  }, []);

  // SLAM 데이터 추가 수신 (points 배열 병합)
  useEffect(() => {
    const handleSlamData = (data) => {
      console.log("Received SLAM data:", data);
      if (data && Array.isArray(data.points)) {
        setMapData((prevData) => ({
          ...prevData,
          normalPosList: [...prevData.normalPosList, ...data.points],
        }));
      } else {
        console.error("Invalid SLAM data format:", data);
      }
    };
    window.electronAPI.onSlamData(handleSlamData);
    return () => {
      window.electronAPI.removeListener("slam-data", handleSlamData);
    };
  }, []);

  // mapData 변경 시 메인 프로세스에 전송
  useEffect(() => {
    window.mapData = mapData;
    console.log("window.mapData updated:", window.mapData);
    if (typeof window !== "undefined" && window.electronAPI) {
      console.log("Sending mapData to main process:", mapData);
      window.electronAPI.sendMapDataToMain(mapData);
    }
  }, [mapData]);

  return (
    <div>
      <MenuBar
        activeMenu={activeMenu}
        setActiveMenu={handleMenuClick}
        mapData={mapData}
        amrIp={amrIp}
        startPushData={startPushData}
        stopPushData={stopPushData}
      />
      <div style={{ paddingTop: "90px", width: "100vw", height: "100vh" }}>
        <MapCanvas
          mapData={mapData}
          onObjectClick={handleObjectClick}
          activeMenu={activeMenu}
          amrPosition={amrPosition}
          onMapDataUpdate={(updatedData) => {
            setMapData(updatedData);
            window.electronAPI.sendMapDataToMain(updatedData);
          }}
          onAddStation={handleAddStation} // 스테이션 추가 함수 전달
        />
        <InfoPanel
          visible={!!clickedObject}
          objectData={clickedObject}
          activeMenu={activeMenu}
          onUpdate={handleObjectUpdate}
          onDelete={handleObjectDelete}
        />
      </div>
      {/* 스테이션 추가 모달은 제거하고 PathModal, SettingsModal만 남깁니다. */}
      <PathModal
        isOpen={isPathModalOpen}
        onClose={closePathModal}
        onSubmit={handleAddPath}
        advancedPointList={mapData.advancedPointList}
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={closeSettingsModal}
        onSave={handleSaveAmrIp}
      />
      <MovementControl amrIp={amrIp} />
    </div>
  );
}

export default App;
