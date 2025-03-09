import React, { useState, useEffect } from "react";
import "./InfoPanel.css";

const expectedPathProps = [
  { key: "direction", label: "Direction (운동 방향)", type: "int" },
  { key: "movestyle", label: "Move Style", type: "int" },
  { key: "maxspeed", label: "Max Speed (최대 속도 m/s)", type: "double" },
  { key: "maxdec", label: "Max Deceleration (최대 감속 m/s)", type: "double" },
  { key: "maxrot", label: "Max Rotation (최대 회전속도 °/s)", type: "double" },
  {
    key: "obsStopDist",
    label: "Obs Stop Dist (장애물 정지 m)",
    type: "double",
  },
  { key: "obsDecDist", label: "Obs Dec Dist (미리 감속 m)", type: "double" },
  { key: "obsExpansion", label: "Obs Expansion (팽창폭 m)", type: "double" },
  {
    key: "decObsExpansion",
    label: "Dec Obs Expansion (감속 팽창 m)",
    type: "double",
  },
  {
    key: "loadMaxSpeed",
    label: "Load Max Speed (적재 최대속도 m/s)",
    type: "double",
  },
  {
    key: "loadMaxRot",
    label: "Load Max Rotation (적재 최대회전속도 °/s)",
    type: "double",
  },
  {
    key: "loadObsStopDist",
    label: "Load Obs Stop Dist (적재 정지 m)",
    type: "double",
  },
  {
    key: "loadObsDecDist",
    label: "Load Obs Dec Dist (적재 조기감속 m)",
    type: "double",
  },
  {
    key: "loadObsExpansion",
    label: "Load Obs Expansion (적재 팽창 m)",
    type: "double",
  },
  {
    key: "loadDecObsExpansion",
    label: "Load Dec Obs Expansion (적재 감속 팽창 m)",
    type: "double",
  },
];

const InfoPanel = ({ visible, objectData, activeMenu, onUpdate, onDelete }) => {
  // objectData가 { type, data } 구조이면 data를 평면화하여 localData로 사용
  const [localData, setLocalData] = useState({});

  useEffect(() => {
    if (objectData) {
      if (objectData.data) {
        // objectData 내부에 data가 있다면 평면화
        setLocalData({ ...objectData.data, type: objectData.type });
      } else {
        setLocalData(objectData);
      }
    }
  }, [objectData]);

  // localData에 최소한 instanceName이 있어야 표시하도록 함
  if (!visible || !localData || !localData.instanceName) return null;

  const handleInputChange = (key, value) => {
    setLocalData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // property 값을 업데이트 (기존 속성이 있으면 수정, 없으면 새로 추가)
  const handlePropertyChange = (key, value, type = "double") => {
    setLocalData((prev) => {
      let newProperties = [];
      if (prev.property && Array.isArray(prev.property)) {
        const exists = prev.property.find((p) => p.key === key);
        if (exists) {
          newProperties = prev.property.map((p) => {
            if (p.key === key) {
              if (p.type === "int") {
                return { ...p, int32Value: parseInt(value, 10) };
              } else if (p.type === "double") {
                return { ...p, doubleValue: parseFloat(value) };
              } else if (p.type === "bool") {
                return { ...p, boolValue: value === "true" };
              }
            }
            return p;
          });
        } else {
          if (type === "int") {
            newProperties = [
              ...prev.property,
              { key, type, int32Value: parseInt(value, 10) },
            ];
          } else if (type === "double") {
            newProperties = [
              ...prev.property,
              { key, type, doubleValue: parseFloat(value) },
            ];
          } else if (type === "bool") {
            newProperties = [
              ...prev.property,
              { key, type, boolValue: value === "true" },
            ];
          } else {
            newProperties = [...prev.property, { key, type, value }];
          }
        }
      } else {
        if (type === "int") {
          newProperties = [{ key, type, int32Value: parseInt(value, 10) }];
        } else if (type === "double") {
          newProperties = [{ key, type, doubleValue: parseFloat(value) }];
        } else if (type === "bool") {
          newProperties = [{ key, type, boolValue: value === "true" }];
        } else {
          newProperties = [{ key, type, value }];
        }
      }
      return { ...prev, property: newProperties };
    });
  };

  const handleSave = () => {
    console.log("Saving object:", localData);
    if (onUpdate) {
      onUpdate(localData);
    }
  };

  const handleDelete = () => {
    console.log("Deleting object:", objectData);
    if (onDelete) {
      onDelete(objectData);
    }
  };

  const renderStationForm = (station) => (
    <div className="info-panel-content">
      <div className="property-row">
        <label className="property-key">Instance Name</label>
        <input
          className="property-input"
          type="text"
          value={station.instanceName || ""}
          readOnly
        />
      </div>
      <div className="property-row">
        <label className="property-key">Position X</label>
        <input
          className="property-input"
          type="number"
          value={station.pos?.x || ""}
          onChange={(e) =>
            handleInputChange("pos", {
              ...station.pos,
              x: parseFloat(e.target.value) || 0,
            })
          }
        />
      </div>
      <div className="property-row">
        <label className="property-key">Position Y</label>
        <input
          className="property-input"
          type="number"
          value={station.pos?.y || ""}
          onChange={(e) =>
            handleInputChange("pos", {
              ...station.pos,
              y: parseFloat(e.target.value) || 0,
            })
          }
        />
      </div>
      <div className="property-row">
        <label className="property-key">Direction</label>
        <input
          className="property-input"
          type="number"
          value={station.dir || ""}
          onChange={(e) =>
            handleInputChange("dir", parseFloat(e.target.value) || 0)
          }
        />
      </div>
    </div>
  );

  const renderPathForm = (path) => (
    <div className="info-panel-content">
      <div className="property-row">
        <label className="property-key">Instance Name</label>
        <input
          className="property-input"
          type="text"
          value={path.instanceName || ""}
          readOnly
        />
      </div>
      {expectedPathProps.map((propInfo, idx) => {
        const existingProp = path.property
          ? path.property.find((p) => p.key === propInfo.key)
          : null;
        let currentValue = "";
        if (existingProp) {
          if (existingProp.type === "double") {
            currentValue = existingProp.doubleValue;
          } else if (existingProp.type === "int") {
            currentValue = existingProp.int32Value;
          } else if (existingProp.type === "bool") {
            currentValue = existingProp.boolValue ? "true" : "false";
          }
        }
        return (
          <div className="property-row" key={idx}>
            <label className="property-key">{propInfo.label}</label>
            <input
              className="property-input"
              type={propInfo.type === "bool" ? "text" : "number"}
              value={currentValue ?? ""}
              onChange={(e) =>
                handlePropertyChange(
                  propInfo.key,
                  e.target.value,
                  propInfo.type
                )
              }
            />
          </div>
        );
      })}
    </div>
  );

  let content;
  if (localData.type === "advancedPoint") {
    content = renderStationForm(localData);
  } else if (localData.type === "advancedCurve") {
    content = renderPathForm(localData);
  } else {
    content = <div className="info-panel-content">Unknown object type</div>;
  }

  return (
    <div className="info-panel-container">
      <div className="info-panel-header">
        <span className="info-panel-title">
          {localData.type === "advancedPoint" ? "Station 정보" : "Path 정보"}{" "}
          {activeMenu === 1 ? "(SLAM 진행 중)" : ""}
        </span>
      </div>
      <div className="info-panel-divider" />
      {content}
      <div className="info-panel-actions">
        <button className="info-panel-button save" onClick={handleSave}>
          저장
        </button>
        <button className="info-panel-button delete" onClick={handleDelete}>
          삭제
        </button>
      </div>
    </div>
  );
};

export default InfoPanel;
