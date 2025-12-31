"use client"
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/app/lib/firebase/config";
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot 
} from "firebase/firestore";

// Available locations
const LOCATIONS = ["Lilongwe", "Blantyre", "Zomba", "Mzuzu", "Chitipa", "Salima"];

export default function ManagerDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const router = useRouter();

  // User Management State
  const [allUsers, setAllUsers] = useState([]);

  // Stocks & Locations State
  const [stocks, setStocks] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("all");
  
  // Stock Transfer State
  const [stockRequests, setStockRequests] = useState([]);
  const [transferStock, setTransferStock] = useState({
    itemCode: "",
    quantity: "",
    fromLocation: "",
    toLocation: ""
  });

  // Sales Analysis State
  const [sales, setSales] = useState([]);
  const [salesAnalysis, setSalesAnalysis] = useState({
    totalSales: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    topProducts: {},
    salesByUser: {},
    revenueByLocation: {},
    locationPerformance: {}
  });

  // Real-time Sales Report State
  const [realTimeSales, setRealTimeSales] = useState({
    todaySales: 0,
    todayRevenue: 0,
    hourlySales: {},
    liveSales: []
  });

  // New Stock State
  const [newStock, setNewStock] = useState({
    brand: "",
    model: "",
    storage: "",
    color: "",
    orderPrice: "",
    salePrice: "",
    discountPercentage: "",
    quantity: "",
    itemCode: "",
    location: ""
  });

  const [processingRequest, setProcessingRequest] = useState(null);
  const [timePeriod, setTimePeriod] = useState("today");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDocs(
            query(collection(db, "users"), where("uid", "==", user.uid))
          );
          
          if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            if (userData.role === "manager") {
              setUser(userData);
              await initializeDashboard();
            } else {
              router.push("/dashboard");
            }
          } else {
            router.push("/login");
          }
        } catch (error) {
          console.error("Error during authentication:", error);
          router.push("/login");
        }
      } else {
        router.push("/login");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, initializeDashboard]);

  const initializeDashboard = async () => {
    try {
      await Promise.all([
        fetchAllUsers(),
        fetchAllStocks(),
        fetchAllSalesAnalysis(),
        fetchAllStockRequests()
      ]);
      setupRealtimeListeners();
    } catch (error) {
      console.error("Error initializing dashboard:", error);
    }
  };

  const setupRealtimeListeners = () => {
    // Real-time stock updates
    const stocksQuery = query(collection(db, "stocks"));
    
    const unsubscribeStocks = onSnapshot(stocksQuery, (snapshot) => {
      const stocksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocks(stocksData);
    });

    // Real-time sales updates
    const salesQuery = query(
      collection(db, "sales"),
      orderBy("soldAt", "desc")
    );

    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
      const salesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);
      calculateSalesAnalysis(salesData);
      calculateRealTimeSales(salesData);
      calculateLocationPerformance(salesData);
    });

    // Real-time stock requests
    const requestsQuery = query(
      collection(db, "stockRequests"),
      where("status", "==", "pending")
    );

    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStockRequests(requestsData);
    });

    return () => {
      unsubscribeStocks();
      unsubscribeSales();
      unsubscribeRequests();
    };
  };

  // Real-time Sales Calculations
  const calculateRealTimeSales = (salesData) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySales = salesData.filter(sale => {
      const saleDate = sale.soldAt?.toDate();
      return saleDate && saleDate >= today;
    });

    const hourlySales = {};
    const liveSales = todaySales.slice(0, 10);

    todaySales.forEach(sale => {
      const saleDate = sale.soldAt?.toDate();
      if (saleDate) {
        const hour = saleDate.getHours();
        hourlySales[hour] = (hourlySales[hour] || 0) + (sale.finalSalePrice || 0);
      }
    });

    setRealTimeSales({
      todaySales: todaySales.length,
      todayRevenue: todaySales.reduce((total, sale) => total + (sale.finalSalePrice || 0), 0),
      hourlySales,
      liveSales
    });
  };

  // Location Performance Calculation
  const calculateLocationPerformance = (salesData) => {
    const locationMetrics = {};
    const today = new Date();
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    LOCATIONS.forEach(location => {
      locationMetrics[location] = {
        totalRevenue: 0,
        todayRevenue: 0,
        weeklyRevenue: 0,
        monthlyRevenue: 0,
        salesCount: 0,
        averageSaleValue: 0,
        peakHours: {},
        topSellers: {}
      };
    });

    salesData.forEach(sale => {
      const location = sale.location || "Unknown";
      if (locationMetrics[location]) {
        const saleDate = sale.soldAt?.toDate();
        const revenue = sale.finalSalePrice || 0;
        
        locationMetrics[location].totalRevenue += revenue;
        locationMetrics[location].salesCount += 1;

        if (saleDate && saleDate >= new Date(today.setHours(0, 0, 0, 0))) {
          locationMetrics[location].todayRevenue += revenue;
        }

        if (saleDate && saleDate >= oneWeekAgo) {
          locationMetrics[location].weeklyRevenue += revenue;
        }

        if (saleDate && saleDate >= oneMonthAgo) {
          locationMetrics[location].monthlyRevenue += revenue;
        }

        if (saleDate) {
          const hour = saleDate.getHours();
          locationMetrics[location].peakHours[hour] = (locationMetrics[location].peakHours[hour] || 0) + 1;
        }

        const seller = sale.soldByName || sale.soldBy;
        locationMetrics[location].topSellers[seller] = (locationMetrics[location].topSellers[seller] || 0) + revenue;
      }
    });

    const locationPerformance = {};
    const allRevenues = Object.values(locationMetrics).map(metric => metric.totalRevenue);
    const maxRevenue = Math.max(...allRevenues);
    const minRevenue = Math.min(...allRevenues);

    Object.keys(locationMetrics).forEach(location => {
      const metric = locationMetrics[location];
      
      const revenueScore = maxRevenue > minRevenue 
        ? ((metric.totalRevenue - minRevenue) / (maxRevenue - minRevenue)) * 40
        : 20;

      const growthRate = metric.monthlyRevenue > 0 
        ? ((metric.weeklyRevenue / metric.monthlyRevenue) * 4) - 1
        : 0;
      const growthScore = Math.min(Math.max(growthRate * 30, 0), 30);

      const efficiency = metric.salesCount > 0 
        ? (metric.totalRevenue / metric.salesCount) / 1000
        : 0;
      const efficiencyScore = Math.min(efficiency * 20, 20);

      const todayActivity = metric.todayRevenue > 0 ? 10 : 0;

      const totalScore = revenueScore + growthScore + efficiencyScore + todayActivity;
      
      locationPerformance[location] = {
        score: Math.round(totalScore),
        grade: getPerformanceGrade(totalScore),
        metrics: metric,
        trend: growthRate > 0.1 ? "up" : growthRate < -0.1 ? "down" : "stable"
      };
    });

    setSalesAnalysis(prev => ({
      ...prev,
      locationPerformance
    }));
  };

  // Performance Helpers
  const getPerformanceGrade = (score) => {
    if (score >= 90) return "Excellent";
    if (score >= 80) return "Very Good";
    if (score >= 70) return "Good";
    if (score >= 60) return "Average";
    if (score >= 50) return "Below Average";
    return "Needs Attention";
  };

  const getPerformanceColor = (score) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    if (score >= 40) return "text-orange-400";
    return "text-red-400";
  };

  const getPerformanceBadge = (score) => {
    if (score >= 80) return "bg-green-500/20 text-green-300";
    if (score >= 60) return "bg-yellow-500/20 text-yellow-300";
    if (score >= 40) return "bg-orange-500/20 text-orange-300";
    return "bg-red-500/20 text-red-300";
  };

  const getTrendIcon = (trend) => {
    if (trend === "up") return "↗";
    if (trend === "down") return "↘";
    return "→";
  };

  const getTrendColor = (trend) => {
    if (trend === "up") return "text-green-400";
    if (trend === "down") return "text-red-400";
    return "text-gray-400";
  };

  // Core Data Fetching Functions
  const fetchAllUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const users = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(users);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchAllStocks = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "stocks"));
      const stocksData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocks(stocksData);
    } catch (error) {
      console.error("Error fetching stocks:", error);
    }
  };

  const fetchAllSalesAnalysis = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "sales"));
      const salesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);
      calculateSalesAnalysis(salesData);
    } catch (error) {
      console.error("Error fetching sales:", error);
    }
  };

  const fetchAllStockRequests = async () => {
    try {
      const q = query(
        collection(db, "stockRequests"),
        where("status", "==", "pending")
      );
      const querySnapshot = await getDocs(q);
      const requestsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStockRequests(requestsData);
    } catch (error) {
      console.error("Error fetching stock requests:", error);
    }
  };

  const calculateSalesAnalysis = (salesData) => {
    const analysis = {
      totalSales: 0,
      totalRevenue: 0,
      monthlyRevenue: 0,
      topProducts: {},
      salesByUser: {},
      revenueByLocation: {},
      locationPerformance: salesAnalysis.locationPerformance
    };

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    salesData.forEach(sale => {
      analysis.totalRevenue += sale.finalSalePrice || 0;
      analysis.totalSales++;

      const saleDate = sale.soldAt?.toDate();
      if (saleDate && saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
        analysis.monthlyRevenue += sale.finalSalePrice || 0;
      }

      const productKey = `${sale.brand}-${sale.model}`;
      analysis.topProducts[productKey] = (analysis.topProducts[productKey] || 0) + 1;

      const userName = sale.soldByName || sale.soldBy;
      analysis.salesByUser[userName] = (analysis.salesByUser[userName] || 0) + (sale.finalSalePrice || 0);

      const location = sale.location || "Unknown";
      analysis.revenueByLocation[location] = (analysis.revenueByLocation[location] || 0) + (sale.finalSalePrice || 0);
    });

    setSalesAnalysis(analysis);
  };

  // User Management Functions with Manager Restrictions
  const handleAssignRole = async (userId, role, currentUserRole) => {
    // Prevent manager from assigning manager, admin, or superadmin roles
    const restrictedRoles = ["manager", "admin", "superadmin"];
    if (restrictedRoles.includes(role)) {
      alert("You are not authorized to assign manager, admin, or superadmin roles.");
      return;
    }

    // Prevent manager from changing their own role
    if (userId === user.uid) {
      alert("You cannot change your own role.");
      return;
    }

    // Prevent manager from changing other managers', admins', or superadmins' roles
    if (restrictedRoles.includes(currentUserRole)) {
      alert("You are not authorized to modify roles of managers, admins, or superadmins.");
      return;
    }

    try {
      await updateDoc(doc(db, "users", userId), {
        role: role,
        lastRoleUpdate: serverTimestamp(),
        updatedBy: user.uid
      });
      fetchAllUsers();
      alert(`Role updated to ${role} successfully!`);
    } catch (error) {
      console.error("Error assigning role:", error);
      alert("Error updating role. Please try again.");
    }
  };

  const handleUpdateUserLocation = async (userId, newLocation, currentUserRole) => {
    // Prevent manager from updating locations of other managers, admins, or superadmins
    const restrictedRoles = ["manager", "admin", "superadmin"];
    if (restrictedRoles.includes(currentUserRole)) {
      alert("You are not authorized to update locations of managers, admins, or superadmins.");
      return;
    }

    try {
      await updateDoc(doc(db, "users", userId), {
        location: newLocation,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      fetchAllUsers();
      alert("User location updated successfully!");
    } catch (error) {
      console.error("Error updating user location:", error);
      alert("Error updating user location. Please try again.");
    }
  };

  // Stock Management Functions
  const handleAddStock = async () => {
    if (!newStock.brand || !newStock.model || !newStock.itemCode || !newStock.quantity || !newStock.location) {
      alert("Please fill in required fields: Brand, Model, Item Code, Quantity, and Location.");
      return;
    }

    try {
      const stockData = {
        ...newStock,
        orderPrice: parseFloat(newStock.orderPrice) || 0,
        salePrice: parseFloat(newStock.salePrice) || 0,
        discountPercentage: parseFloat(newStock.discountPercentage) || 0,
        quantity: parseInt(newStock.quantity) || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        addedBy: user.uid,
        addedByName: user.fullName
      };

      await addDoc(collection(db, "stocks"), stockData);
      
      setNewStock({
        brand: "",
        model: "",
        storage: "",
        color: "",
        orderPrice: "",
        salePrice: "",
        discountPercentage: "",
        quantity: "",
        itemCode: "",
        location: ""
      });
      
      alert("Stock added successfully!");
    } catch (error) {
      console.error("Error adding stock:", error);
      alert("Error adding stock. Please try again.");
    }
  };

  const handleUpdateStock = async (stockId, updates) => {
    try {
      await updateDoc(doc(db, "stocks", stockId), {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      alert("Stock updated successfully!");
    } catch (error) {
      console.error("Error updating stock:", error);
      alert("Error updating stock. Please try again.");
    }
  };

  const handleRequestStock = async () => {
    if (!transferStock.itemCode || !transferStock.quantity || !transferStock.fromLocation || !transferStock.toLocation) {
      alert("Please fill in all required fields.");
      return;
    }

    try {
      const requestData = {
        ...transferStock,
        quantity: parseInt(transferStock.quantity),
        status: "pending",
        requestedBy: user.uid,
        requestedByName: user.fullName,
        requestedAt: serverTimestamp()
      };

      await addDoc(collection(db, "stockRequests"), requestData);
      
      setTransferStock({
        itemCode: "",
        quantity: "",
        fromLocation: "",
        toLocation: ""
      });
      
      alert("Stock request sent successfully!");
    } catch (error) {
      console.error("Error requesting stock:", error);
      alert("Error requesting stock. Please try again.");
    }
  };

  const handleApproveStockRequest = async (requestId, requestData) => {
    if (processingRequest === requestId) return;
    
    setProcessingRequest(requestId);
    
    try {
      if (!requestData.itemCode || !requestData.quantity || !requestData.fromLocation || !requestData.toLocation) {
        alert("Invalid request data. Missing required fields.");
        return;
      }

      const stockQuery = query(
        collection(db, "stocks"),
        where("itemCode", "==", requestData.itemCode),
        where("location", "==", requestData.fromLocation)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      
      if (stockSnapshot.empty) {
        await updateDoc(doc(db, "stockRequests", requestId), {
          status: "rejected",
          rejectionReason: "Item not found in source location",
          rejectedBy: user.uid,
          rejectedByName: user.fullName,
          rejectedAt: serverTimestamp()
        });
        alert("Request rejected: Item not found in source location!");
        return;
      }

      const stockDoc = stockSnapshot.docs[0];
      const stock = stockDoc.data();

      if (stock.quantity < requestData.quantity) {
        await updateDoc(doc(db, "stockRequests", requestId), {
          status: "rejected",
          rejectionReason: "Insufficient stock in source location",
          rejectedBy: user.uid,
          rejectedByName: user.fullName,
          rejectedAt: serverTimestamp()
        });
        alert("Request rejected: Insufficient stock in source location!");
        return;
      }

      await updateDoc(doc(db, "stocks", stockDoc.id), {
        quantity: stock.quantity - requestData.quantity,
        updatedAt: serverTimestamp(),
        lastTransfer: {
          toLocation: requestData.toLocation,
          quantity: requestData.quantity,
          transferredAt: serverTimestamp(),
          transferredBy: user.uid
        }
      });

      const destStockQuery = query(
        collection(db, "stocks"),
        where("itemCode", "==", requestData.itemCode),
        where("location", "==", requestData.toLocation)
      );

      const destStockSnapshot = await getDocs(destStockQuery);

      if (destStockSnapshot.empty) {
        await addDoc(collection(db, "stocks"), {
          ...stock,
          quantity: requestData.quantity,
          location: requestData.toLocation,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          transferredFrom: requestData.fromLocation,
          originalStockId: stockDoc.id
        });
      } else {
        const destStockDoc = destStockSnapshot.docs[0];
        const destStock = destStockDoc.data();
        await updateDoc(doc(db, "stocks", destStockDoc.id), {
          quantity: destStock.quantity + requestData.quantity,
          updatedAt: serverTimestamp(),
          lastRestock: {
            fromLocation: requestData.fromLocation,
            quantity: requestData.quantity,
            restockedAt: serverTimestamp(),
            restockedBy: user.uid
          }
        });
      }

      await updateDoc(doc(db, "stockRequests", requestId), {
        status: "approved",
        approvedBy: user.uid,
        approvedByName: user.fullName,
        approvedAt: serverTimestamp(),
        sourceStockId: stockDoc.id,
        processedAt: serverTimestamp()
      });

      await addDoc(collection(db, "stockTransfers"), {
        requestId: requestId,
        itemCode: requestData.itemCode,
        brand: stock.brand,
        model: stock.model,
        quantity: requestData.quantity,
        fromLocation: requestData.fromLocation,
        toLocation: requestData.toLocation,
        transferredBy: user.uid,
        transferredByName: user.fullName,
        transferredAt: serverTimestamp(),
        type: "approved_transfer"
      });

      alert("Stock request approved and transferred successfully!");
    } catch (error) {
      console.error("Error approving stock request:", error);
      
      try {
        await updateDoc(doc(db, "stockRequests", requestId), {
          status: "failed",
          error: error.message,
          failedAt: serverTimestamp()
        });
      } catch (updateError) {
        console.error("Error updating request status:", updateError);
      }
      
      alert("Error approving stock request. Please try again.");
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRejectStockRequest = async (requestId, requestData) => {
    const reason = prompt("Please enter rejection reason:", "Insufficient stock");
    
    if (reason === null) return;

    try {
      await updateDoc(doc(db, "stockRequests", requestId), {
        status: "rejected",
        rejectionReason: reason || "No reason provided",
        rejectedBy: user.uid,
        rejectedByName: user.fullName,
        rejectedAt: serverTimestamp()
      });

      await addDoc(collection(db, "stockTransfers"), {
        requestId: requestId,
        itemCode: requestData.itemCode,
        quantity: requestData.quantity,
        fromLocation: requestData.fromLocation,
        toLocation: requestData.toLocation,
        rejectedBy: user.uid,
        rejectedByName: user.fullName,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason,
        type: "rejected_transfer"
      });

      alert("Stock request rejected!");
    } catch (error) {
      console.error("Error rejecting stock request:", error);
      alert("Error rejecting stock request. Please try again.");
    }
  };

  const handleMarkAsSold = async (stockId, stockData) => {
    try {
      if (stockData.quantity <= 0) {
        alert("Insufficient stock!");
        return;
      }

      // Update stock quantity
      await updateDoc(doc(db, "stocks", stockId), {
        quantity: stockData.quantity - 1,
        updatedAt: serverTimestamp()
      });

      // Create sale record
      await addDoc(collection(db, "sales"), {
        ...stockData,
        stockId,
        quantity: 1,
        originalPrice: stockData.salePrice,
        finalSalePrice: stockData.salePrice * (1 - (stockData.discountPercentage || 0) / 100),
        soldAt: serverTimestamp(),
        soldBy: user.uid,
        soldByName: user.fullName,
        location: stockData.location
      });

      alert("Item marked as sold!");
    } catch (error) {
      console.error("Error marking as sold:", error);
      alert("Error marking item as sold. Please try again.");
    }
  };

  // Filter Functions
  const getFilteredStocks = () => {
    if (selectedLocation === "all") {
      return stocks;
    }
    return stocks.filter(stock => stock.location === selectedLocation);
  };

  const getFilteredSales = () => {
    if (selectedLocation === "all") {
      return sales;
    }
    return sales.filter(sale => sale.location === selectedLocation);
  };

  const getFilteredStockRequests = () => {
    if (selectedLocation === "all") {
      return stockRequests;
    }
    return stockRequests.filter(request => 
      request.fromLocation === selectedLocation || request.toLocation === selectedLocation
    );
  };

  const calculateTotalStockValue = () => {
    const filteredStocks = getFilteredStocks();
    return filteredStocks.reduce((total, stock) => {
      return total + ((stock.orderPrice || 0) * (stock.quantity || 0));
    }, 0);
  };

  // Filter users to exclude managers, admins, and superadmins from role/location changes
  const getFilteredUsers = () => {
    return allUsers.filter(userItem => 
      !["manager", "admin", "superadmin"].includes(userItem.role)
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading Manager Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                KM ELECTRONICS <span className="text-orange-500">Manager</span>
              </h1>
              <p className="text-white/70 text-sm">
                Welcome, {user?.fullName} | Multi-Location View Enabled
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
              >
                <option value="all">All Locations</option>
                {LOCATIONS.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
              
              <button
                onClick={() => signOut(auth).then(() => router.push("/login"))}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-b border-white/20">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {[
              { id: "dashboard", name: "Dashboard" },
              { id: "salesReport", name: "Sales Report" },
              { id: "locationPerformance", name: "Location Performance" },
              { id: "stocks", name: "Stock Management" },
              { id: "sales", name: "Sales Analysis" },
              { id: "transfer", name: "Stock Transfer" },
              { id: "personnel", name: "Personnel Management" },
              { id: "requests", name: "Stock Requests", count: getFilteredStockRequests().length }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? "border-orange-500 text-orange-400"
                    : "border-transparent text-white/70 hover:text-white hover:border-white/30"
                }`}
              >
                {tab.name}
                {tab.count > 0 && (
                  <span className="ml-2 bg-orange-500 text-white py-0.5 px-2 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="py-6">
          {/* Dashboard Tab */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Analytics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                  <h3 className="text-white/70 text-sm">Today's Sales</h3>
                  <p className="text-2xl font-bold text-green-400">
                    {realTimeSales.todaySales}
                  </p>
                  <p className="text-white/50 text-sm mt-1">
                    ₹{realTimeSales.todayRevenue?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                  <h3 className="text-white/70 text-sm">Total Revenue</h3>
                  <p className="text-2xl font-bold text-blue-400">
                    ₹{salesAnalysis.totalRevenue?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                  <h3 className="text-white/70 text-sm">Monthly Revenue</h3>
                  <p className="text-2xl font-bold text-purple-400">
                    ₹{salesAnalysis.monthlyRevenue?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                  <h3 className="text-white/70 text-sm">Pending Requests</h3>
                  <p className="text-2xl font-bold text-orange-400">
                    {getFilteredStockRequests().length}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Location Performance Overview */}
                <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
                  <h2 className="text-xl font-semibold text-white mb-4">Location Performance</h2>
                  <div className="space-y-3">
                    {Object.entries(salesAnalysis.locationPerformance || {}).map(([location, data]) => (
                      <div key={location} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded-full ${
                            data.score >= 80 ? 'bg-green-500' :
                            data.score >= 60 ? 'bg-yellow-500' :
                            data.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                          }`}></div>
                          <span className="text-white font-medium">{location}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm ${getTrendColor(data.trend)}`}>
                            {getTrendIcon(data.trend)}
                          </span>
                          <span className={`text-lg font-bold ${getPerformanceColor(data.score)}`}>
                            {data.score}%
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs ${getPerformanceBadge(data.score)}`}>
                            {data.grade}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Sales Feed */}
                <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
                  <h2 className="text-xl font-semibold text-white mb-4">Live Sales Feed</h2>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {realTimeSales.liveSales.map((sale) => (
                      <div key={sale.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                        <div>
                          <div className="text-white font-medium">{sale.brand} {sale.model}</div>
                          <div className="text-white/70 text-sm">
                            {sale.location} • {sale.soldByName}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-green-400 font-semibold">₹{sale.finalSalePrice || 0}</div>
                          <div className="text-white/50 text-xs">
                            {sale.soldAt?.toDate().toLocaleTimeString() || "Just now"}
                          </div>
                        </div>
                      </div>
                    ))}
                    {realTimeSales.liveSales.length === 0 && (
                      <p className="text-white/70 text-center py-4">No sales today</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Revenue by Location */}
              <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Revenue by Location</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {Object.entries(salesAnalysis.revenueByLocation).map(([location, revenue]) => (
                    <div key={location} className="bg-white/5 rounded-lg p-4 text-center">
                      <h3 className="text-white/70 text-sm">{location}</h3>
                      <p className="text-lg font-bold text-green-400">
                        ₹{revenue.toLocaleString()}
                      </p>
                      {salesAnalysis.locationPerformance?.[location] && (
                        <p className={`text-xs mt-1 ${getPerformanceColor(salesAnalysis.locationPerformance[location].score)}`}>
                          {salesAnalysis.locationPerformance[location].score}%
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sales Report Tab */}
          {activeTab === "salesReport" && (
            <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-white">Real-time Sales Report</h2>
                <select
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                >
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                </select>
              </div>

              {/* Sales Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="bg-white/5 rounded-lg p-6 text-center">
                  <div className="text-2xl font-bold text-green-400">{realTimeSales.todaySales}</div>
                  <div className="text-white/70 text-sm">Today's Sales</div>
                </div>
                <div className="bg-white/5 rounded-lg p-6 text-center">
                  <div className="text-2xl font-bold text-blue-400">
                    ₹{realTimeSales.todayRevenue?.toLocaleString() || 0}
                  </div>
                  <div className="text-white/70 text-sm">Today's Revenue</div>
                </div>
                <div className="bg-white/5 rounded-lg p-6 text-center">
                  <div className="text-2xl font-bold text-purple-400">
                    {salesAnalysis.totalSales}
                  </div>
                  <div className="text-white/70 text-sm">Total Sales</div>
                </div>
                <div className="bg-white/5 rounded-lg p-6 text-center">
                  <div className="text-2xl font-bold text-orange-400">
                    ₹{salesAnalysis.totalRevenue?.toLocaleString() || 0}
                  </div>
                  <div className="text-white/70 text-sm">Total Revenue</div>
                </div>
              </div>

              {/* Hourly Sales Chart */}
              <div className="bg-white/5 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">Today's Hourly Sales</h3>
                <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                  {Array.from({ length: 12 }, (_, i) => i + 8).map(hour => (
                    <div key={hour} className="text-center">
                      <div className="text-white/70 text-xs mb-1">{hour}:00</div>
                      <div className="bg-blue-500/20 rounded-lg p-2">
                        <div className="text-blue-300 text-sm font-semibold">
                          ₹{((realTimeSales.hourlySales[hour] || 0) / 1000).toFixed(0)}K
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Location-wise Breakdown */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Location Performance Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-white">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left py-2">Location</th>
                        <th className="text-left py-2">Today's Revenue</th>
                        <th className="text-left py-2">Weekly Revenue</th>
                        <th className="text-left py-2">Performance</th>
                        <th className="text-left py-2">Grade</th>
                        <th className="text-left py-2">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(salesAnalysis.locationPerformance || {}).map(([location, data]) => (
                        <tr key={location} className="border-b border-white/10">
                          <td className="py-2 font-medium">{location}</td>
                          <td className="py-2">₹{data.metrics.todayRevenue.toLocaleString()}</td>
                          <td className="py-2">₹{data.metrics.weeklyRevenue.toLocaleString()}</td>
                          <td className="py-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-24 bg-gray-700 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${
                                    data.score >= 80 ? 'bg-green-500' :
                                    data.score >= 60 ? 'bg-yellow-500' :
                                    data.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${data.score}%` }}
                                ></div>
                              </div>
                              <span className={`font-semibold ${getPerformanceColor(data.score)}`}>
                                {data.score}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${getPerformanceBadge(data.score)}`}>
                              {data.grade}
                            </span>
                          </td>
                          <td className="py-2">
                            <span className={`text-lg ${getTrendColor(data.trend)}`}>
                              {getTrendIcon(data.trend)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Location Performance Tab */}
          {activeTab === "locationPerformance" && (
            <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-semibold text-white mb-6">Location Performance Analytics</h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {Object.entries(salesAnalysis.locationPerformance || {}).map(([location, data]) => (
                  <div key={location} className="bg-white/5 rounded-lg p-6 border border-white/10">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-semibold text-white">{location}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm ${getPerformanceBadge(data.score)}`}>
                        {data.grade}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-white/70">Performance Score</span>
                        <span className={`text-xl font-bold ${getPerformanceColor(data.score)}`}>
                          {data.score}%
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-white/70">Today's Revenue</span>
                        <span className="text-green-400 font-semibold">
                          ₹{data.metrics.todayRevenue.toLocaleString()}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-white/70">Weekly Revenue</span>
                        <span className="text-blue-400 font-semibold">
                          ₹{data.metrics.weeklyRevenue.toLocaleString()}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-white/70">Total Sales</span>
                        <span className="text-white font-semibold">
                          {data.metrics.salesCount}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-white/70">Avg. Sale Value</span>
                        <span className="text-purple-400 font-semibold">
                          ₹{data.metrics.salesCount > 0 ? (data.metrics.totalRevenue / data.metrics.salesCount).toFixed(2) : 0}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-white/70">Trend</span>
                        <span className={`text-lg ${getTrendColor(data.trend)}`}>
                          {getTrendIcon(data.trend)} {data.trend}
                        </span>
                      </div>
                    </div>
                    
                    {/* Performance Progress Bar */}
                    <div className="mt-4">
                      <div className="w-full bg-gray-700 rounded-full h-3">
                        <div 
                          className={`h-3 rounded-full ${
                            data.score >= 80 ? 'bg-green-500' :
                            data.score >= 60 ? 'bg-yellow-500' :
                            data.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${data.score}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Performance Summary */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Performance Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">
                      {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score >= 80).length}
                    </div>
                    <div className="text-white/70 text-sm">Excellent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-400">
                      {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score >= 60 && p.score < 80).length}
                    </div>
                    <div className="text-white/70 text-sm">Good</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-400">
                      {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score >= 40 && p.score < 60).length}
                    </div>
                    <div className="text-white/70 text-sm">Average</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-400">
                      {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score < 40).length}
                    </div>
                    <div className="text-white/70 text-sm">Needs Attention</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stock Management Tab */}
          {activeTab === "stocks" && (
            <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-white">
                  Stock Management - {selectedLocation === "all" ? "All Locations" : selectedLocation}
                </h2>
                <div className="text-white">
                  Total Value: ₹{calculateTotalStockValue().toLocaleString()}
                </div>
              </div>

              {/* Add Stock Form */}
              <div className="bg-white/5 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">Add New Stock</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <input
                    type="text"
                    placeholder="Brand"
                    value={newStock.brand}
                    onChange={(e) => setNewStock({...newStock, brand: e.target.value})}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                  />
                  <input
                    type="text"
                    placeholder="Model"
                    value={newStock.model}
                    onChange={(e) => setNewStock({...newStock, model: e.target.value})}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                  />
                  <input
                    type="text"
                    placeholder="Item Code"
                    value={newStock.itemCode}
                    onChange={(e) => setNewStock({...newStock, itemCode: e.target.value})}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                  />
                  <select
                    value={newStock.location}
                    onChange={(e) => setNewStock({...newStock, location: e.target.value})}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Select Location</option>
                    {LOCATIONS.map(location => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Quantity"
                    value={newStock.quantity}
                    onChange={(e) => setNewStock({...newStock, quantity: e.target.value})}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                  />
                  <input
                    type="number"
                    placeholder="Order Price"
                    value={newStock.orderPrice}
                    onChange={(e) => setNewStock({...newStock, orderPrice: e.target.value})}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                  />
                  <input
                    type="number"
                    placeholder="Sale Price"
                    value={newStock.salePrice}
                    onChange={(e) => setNewStock({...newStock, salePrice: e.target.value})}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                  />
                  <input
                    type="number"
                    placeholder="Discount %"
                    value={newStock.discountPercentage}
                    onChange={(e) => setNewStock({...newStock, discountPercentage: e.target.value})}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                  />
                </div>
                <button
                  onClick={handleAddStock}
                  className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Add Stock
                </button>
              </div>

              {/* Stocks Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-white">
                  <thead>
                    <tr className="border-b border-white/20">
                      {selectedLocation === "all" && <th className="text-left py-2">Location</th>}
                      <th className="text-left py-2">Item Code</th>
                      <th className="text-left py-2">Brand & Model</th>
                      <th className="text-left py-2">Order Price</th>
                      <th className="text-left py-2">Sale Price</th>
                      <th className="text-left py-2">Quantity</th>
                      <th className="text-left py-2">Total Value</th>
                      <th className="text-left py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredStocks().map((stock) => (
                      <tr key={stock.id} className="border-b border-white/10">
                        {selectedLocation === "all" && (
                          <td className="py-2">
                            <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs">
                              {stock.location}
                            </span>
                          </td>
                        )}
                        <td className="py-2 font-mono">{stock.itemCode}</td>
                        <td className="py-2">{stock.brand} {stock.model}</td>
                        <td className="py-2">₹{stock.orderPrice || 0}</td>
                        <td className="py-2">₹{stock.salePrice || 0}</td>
                        <td className="py-2">{stock.quantity || 0}</td>
                        <td className="py-2">₹{((stock.orderPrice || 0) * (stock.quantity || 0)).toLocaleString()}</td>
                        <td className="py-2 space-x-2">
                          <button
                            onClick={() => handleMarkAsSold(stock.id, stock)}
                            disabled={!stock.quantity || stock.quantity === 0}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
                          >
                            Sell
                          </button>
                          <button
                            onClick={() => handleUpdateStock(stock.id, { quantity: (stock.quantity || 0) + 1 })}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors"
                          >
                            +1
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sales Analysis Tab */}
          {activeTab === "sales" && (
            <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">
                Sales Analysis - {selectedLocation === "all" ? "All Locations" : selectedLocation}
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="text-white/70 text-sm">Total Sales</h3>
                  <p className="text-2xl font-bold text-white">{getFilteredSales().length}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="text-white/70 text-sm">Total Revenue</h3>
                  <p className="text-2xl font-bold text-green-400">
                    ₹{getFilteredSales().reduce((total, sale) => total + (sale.finalSalePrice || 0), 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <h3 className="text-white/70 text-sm">Monthly Revenue</h3>
                  <p className="text-2xl font-bold text-blue-400">
                    ₹{salesAnalysis.monthlyRevenue?.toLocaleString() || 0}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-white">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left py-2">Item</th>
                      {selectedLocation === "all" && <th className="text-left py-2">Location</th>}
                      <th className="text-left py-2">Sold By</th>
                      <th className="text-left py-2">Final Price</th>
                      <th className="text-left py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredSales().map((sale) => (
                      <tr key={sale.id} className="border-b border-white/10">
                        <td className="py-2">
                          {sale.brand} {sale.model} ({sale.itemCode})
                        </td>
                        {selectedLocation === "all" && <td className="py-2">{sale.location || "Unknown"}</td>}
                        <td className="py-2">{sale.soldByName || sale.soldBy}</td>
                        <td className="py-2">₹{sale.finalSalePrice || 0}</td>
                        <td className="py-2">
                          {sale.soldAt?.toDate().toLocaleDateString() || "Unknown date"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stock Transfer Tab */}
          {activeTab === "transfer" && (
            <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Request Stock Transfer</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <input
                  type="text"
                  placeholder="Item Code"
                  value={transferStock.itemCode}
                  onChange={(e) => setTransferStock({...transferStock, itemCode: e.target.value})}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                />
                <input
                  type="number"
                  placeholder="Quantity"
                  value={transferStock.quantity}
                  onChange={(e) => setTransferStock({...transferStock, quantity: e.target.value})}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                />
                <select
                  value={transferStock.fromLocation}
                  onChange={(e) => setTransferStock({...transferStock, fromLocation: e.target.value})}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">Select Source Location</option>
                  {LOCATIONS.map(location => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
                <select
                  value={transferStock.toLocation}
                  onChange={(e) => setTransferStock({...transferStock, toLocation: e.target.value})}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">Select Destination Location</option>
                  {LOCATIONS.map(location => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
                <button
                  onClick={handleRequestStock}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg transition-colors col-span-2"
                >
                  Request Stock Transfer
                </button>
              </div>
            </div>
          )}

          {/* Personnel Management Tab */}
          {activeTab === "personnel" && (
            <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Personnel Management</h2>
              
              <div className="overflow-x-auto">
                <table className="w-full text-white">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left py-2">Name</th>
                      <th className="text-left py-2">Email</th>
                      <th className="text-left py-2">Current Role</th>
                      <th className="text-left py-2">Location</th>
                      <th className="text-left py-2">Assign Role</th>
                      <th className="text-left py-2">Update Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredUsers().map((userItem) => (
                      <tr key={userItem.id} className="border-b border-white/10">
                        <td className="py-2">{userItem.fullName}</td>
                        <td className="py-2">{userItem.email}</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            userItem.role === 'manager' ? 'bg-orange-500/20 text-orange-300' :
                            userItem.role === 'sales' ? 'bg-blue-500/20 text-blue-300' :
                            userItem.role === 'dataEntry' ? 'bg-green-500/20 text-green-300' :
                            'bg-gray-500/20 text-gray-300'
                          }`}>
                            {userItem.role}
                          </span>
                        </td>
                        <td className="py-2">{userItem.location || 'Not assigned'}</td>
                        <td className="py-2">
                          <select
                            value={userItem.role}
                            onChange={(e) => handleAssignRole(userItem.id, e.target.value, userItem.role)}
                            className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                          >
                            <option value="sales">Sales Personnel</option>
                            <option value="dataEntry">Data Entry Clerk</option>
                            <option value="user">Regular User</option>
                          </select>
                        </td>
                        <td className="py-2">
                          <select
                            value={userItem.location || ''}
                            onChange={(e) => handleUpdateUserLocation(userItem.id, e.target.value, userItem.role)}
                            className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                          >
                            <option value="">Select Location</option>
                            {LOCATIONS.map(location => (
                              <option key={location} value={location}>{location}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stock Requests Tab */}
          {activeTab === "requests" && (
            <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">
                Stock Request Approval - {selectedLocation === "all" ? "All Locations" : selectedLocation}
              </h2>
              
              {getFilteredStockRequests().length === 0 ? (
                <p className="text-white/70">No pending stock requests.</p>
              ) : (
                <div className="space-y-4">
                  {getFilteredStockRequests().map((request) => (
                    <div key={request.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="font-semibold text-white">Item: {request.itemCode}</h3>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-white/70">Quantity: </span>
                              <span className="text-white">{request.quantity}</span>
                            </div>
                            <div>
                              <span className="text-white/70">From: </span>
                              <span className="text-blue-300">{request.fromLocation}</span>
                            </div>
                            <div>
                              <span className="text-white/70">To: </span>
                              <span className="text-green-300">{request.toLocation}</span>
                            </div>
                            <div>
                              <span className="text-white/70">Requested by: </span>
                              <span className="text-white">{request.requestedByName}</span>
                            </div>
                            <div>
                              <span className="text-white/70">Requested at: </span>
                              <span className="text-white/50">
                                {request.requestedAt?.toDate().toLocaleString() || "Unknown date"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleApproveStockRequest(request.id, request)}
                            disabled={processingRequest === request.id}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg transition-colors"
                          >
                            {processingRequest === request.id ? "Processing..." : "Approve"}
                          </button>
                          <button
                            onClick={() => handleRejectStockRequest(request.id, request)}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}