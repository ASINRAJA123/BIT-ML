import React, { useContext } from 'react';
import { AuthContext } from '../../App';
import AdminDashboard from '../../pages/AdminDashboard/AdminDashboard';
import StudentDashboard from '../../pages/StudentDashboard/StudentDashboard';

const DashboardPage = () => {
  const { user } = useContext(AuthContext);

  return (
    <div>
      {user.role === 'admin' ? <AdminDashboard /> : <StudentDashboard />}
    </div>
  );
};

export default DashboardPage;