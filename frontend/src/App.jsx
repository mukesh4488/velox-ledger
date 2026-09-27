import React,{useContext} from 'react';
import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom';
import {AuthProvider,AuthContext} from './context/AuthContext';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import OwnerDashboard from './pages/OwnerDashboard';
import OwnerCustomers from './pages/OwnerCustomers';
import OwnerCustomerProfile from './pages/OwnerCustomerProfile';
import OwnerAnalytics from './pages/OwnerAnalytics';
import CustomerDashboard from './pages/CustomerDashboard';
function Guard({children,role}){const{user,loading}=useContext(AuthContext);if(loading)return <div className="screen-center"><div className="loader"/></div>;if(!user)return <Navigate to="/" replace/>;if(role&&user.role!==role)return <Navigate to={user.role==='OWNER'?'/owner/dashboard':'/customer/dashboard'} replace/>;return children;}
function RoutesView(){const{user}=useContext(AuthContext);return <Routes><Route path="/" element={user?<Navigate to={user.role==='OWNER'?'/owner/dashboard':'/customer/dashboard'} replace/>:<Login/>}/><Route path="/forgot-password" element={<ForgotPassword/>}/><Route path="/reset-password" element={<ResetPassword/>}/><Route path="/owner/dashboard" element={<Guard role="OWNER"><OwnerDashboard/></Guard>}/><Route path="/owner/customers" element={<Guard role="OWNER"><OwnerCustomers/></Guard>}/><Route path="/owner/customers/:id" element={<Guard role="OWNER"><OwnerCustomerProfile/></Guard>}/><Route path="/owner/analytics" element={<Guard role="OWNER"><OwnerAnalytics/></Guard>}/><Route path="/customer/dashboard" element={<Guard role="CUSTOMER"><CustomerDashboard/></Guard>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}
export default function App(){return <AuthProvider><BrowserRouter><RoutesView/></BrowserRouter></AuthProvider>}
