import React from "react";
import "./Modal.css";

const Modal = ({ isOpen, onClose, onSubmit }) => {
  const [x, setX] = React.useState("");
  const [y, setY] = React.useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    const mapX = parseFloat(x);
    const mapY = parseFloat(y);

    if (isNaN(mapX) || isNaN(mapY)) {
      alert("Invalid input! Please enter numeric values.");
      return;
    }

    onSubmit(mapX, mapY);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>스테이션 좌표 입력</h2>
        <div className="modal-input-group">
          <label>
            X 좌표:
            <input
              type="text"
              value={x}
              onChange={(e) => setX(e.target.value)}
              placeholder="Enter X coordinate"
            />
          </label>
        </div>
        <div className="modal-input-group">
          <label>
            Y 좌표:
            <input
              type="text"
              value={y}
              onChange={(e) => setY(e.target.value)}
              placeholder="Enter Y coordinate"
            />
          </label>
        </div>
        <div className="modal-actions">
        <button className="submit" onClick={handleSubmit}>
            추가
          </button>
          <button className="cancel" onClick={onClose}>
            취소
          </button>
          
        </div>
      </div>
    </div>
  );
};

export default Modal;
