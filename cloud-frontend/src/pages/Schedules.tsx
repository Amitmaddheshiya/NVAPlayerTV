import { Navigate } from 'react-router-dom';

/**
 * Legacy global schedules are not supported by the current API. Scheduling is
 * configured per device or group through the routed UserSchedules screen.
 */
export const Schedules = () => <Navigate to="/dashboard" replace />;
