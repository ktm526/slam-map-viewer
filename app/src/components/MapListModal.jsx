import React, { useEffect, useState } from 'react';
import './MapListModal.css'; // Add necessary styling

const MapListModal = ({ isOpen, onClose, amrIp }) => {
    const [mapList, setMapList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && amrIp) {
            setLoading(true);
            setError(null);

            window.electronAPI.getMapList(amrIp)
                .then((response) => {
                    if (response.ret_code === 0) {
                        setMapList(response.maps || []);
                    } else {
                        setError('Failed to fetch map list.');
                    }
                })
                .catch((err) => setError(`Error: ${err.message}`))
                .finally(() => setLoading(false));
        }
    }, [isOpen, amrIp]);

    return (
        <div className={`modal ${isOpen ? 'open' : ''}`}>
            <div className="modal-content">
                <h2>Map List</h2>
                {loading ? (
                    <p>Loading...</p>
                ) : error ? (
                    <p className="error">{error}</p>
                ) : (
                    <ul>
                        {mapList.map((mapName, index) => (
                            <li key={index}>{mapName}</li>
                        ))}
                    </ul>
                )}
                <button onClick={onClose}>Close</button>
            </div>
        </div>
    );
};

export default MapListModal;
