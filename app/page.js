"use client"
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function NeuronTechLoader() {
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    // Simulate loading progress
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(() => {
            setIsVisible(false);
            router.push("/login");
          }, 500);
          return 100;
        }
        return prev + Math.random() * 10;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [isClient, router]);

  if (!isVisible || !isClient) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center z-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent mb-2">
            KM ELECTRONICS
          </h1>
          <p className="text-pink-300 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Pre-defined positions to avoid random values during SSR
  const particlePositions = [
    { left: 10, top: 20, delay: 0, duration: 4 },
    { left: 25, top: 80, delay: 0.5, duration: 3.5 },
    { left: 40, top: 40, delay: 1, duration: 4.2 },
    { left: 60, top: 10, delay: 1.5, duration: 3.8 },
    { left: 80, top: 60, delay: 2, duration: 4.1 },
    { left: 90, top: 30, delay: 2.5, duration: 3.9 },
    { left: 15, top: 70, delay: 3, duration: 4.3 },
    { left: 70, top: 90, delay: 3.5, duration: 3.7 },
    { left: 30, top: 15, delay: 0.2, duration: 4.4 },
    { left: 85, top: 75, delay: 0.7, duration: 3.6 },
  ];

  const binaryPositions = [
    { left: 5, delay: 0, duration: 15 },
    { left: 15, delay: 1, duration: 12 },
    { left: 25, delay: 2, duration: 18 },
    { left: 35, delay: 3, duration: 14 },
    { left: 45, delay: 4, duration: 16 },
    { left: 55, delay: 0.5, duration: 13 },
    { left: 65, delay: 1.5, duration: 17 },
    { left: 75, delay: 2.5, duration: 11 },
    { left: 85, delay: 3.5, duration: 19 },
    { left: 95, delay: 4.5, duration: 12 },
  ];

  const dendriteConfigs = [
    { angle: 0, length: 30 },
    { angle: 45, length: 35 },
    { angle: 90, length: 28 },
    { angle: 135, length: 32 },
    { angle: 180, length: 29 },
    { angle: 225, length: 36 },
    { angle: 270, length: 31 },
    { angle: 315, length: 33 },
  ];

  const synapseConfigs = [
    { angle: 0, radius: 40 },
    { angle: 30, radius: 38 },
    { angle: 60, radius: 42 },
    { angle: 90, radius: 35 },
    { angle: 120, radius: 45 },
    { angle: 150, radius: 37 },
    { angle: 180, radius: 41 },
    { angle: 210, radius: 39 },
    { angle: 240, radius: 43 },
    { angle: 270, radius: 36 },
    { angle: 300, radius: 44 },
    { angle: 330, radius: 40 },
  ];

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center z-50">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-pink-900/20 via-purple-900/10 to-slate-900/20">
        {/* Floating particles */}
        {particlePositions.map((pos, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-pink-400 rounded-full animate-float"
            style={{
              left: `${pos.left}%`,
              top: `${pos.top}%`,
              animationDelay: `${pos.delay}s`,
              animationDuration: `${pos.duration}s`
            }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center">
        {/* Main Neuron Container */}
        <div className="relative w-64 h-64 mx-auto mb-8">
          {/* Central Node */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full animate-pulse shadow-lg shadow-pink-500/50">
              <div className="absolute inset-0 rounded-full bg-pink-500 animate-ping opacity-20"></div>
            </div>
          </div>

          {/* Neuron Connections */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
            {/* Main Axon */}
            <path
              d="M50,50 L85,50"
              stroke="url(#gradient1)"
              strokeWidth="0.5"
              fill="none"
              className="animate-pulse"
            >
              <animate
                attributeName="stroke-dasharray"
                values="0 10;5 5;0 10"
                dur="2s"
                repeatCount="indefinite"
              />
            </path>

            {/* Dendrites */}
            {dendriteConfigs.map((config, i) => {
              const angleRad = (config.angle * Math.PI) / 180;
              const endX = 50 + Math.cos(angleRad) * config.length;
              const endY = 50 + Math.sin(angleRad) * config.length;
              
              return (
                <path
                  key={i}
                  d={`M50,50 L${endX},${endY}`}
                  stroke="url(#gradient2)"
                  strokeWidth="0.3"
                  fill="none"
                >
                  <animate
                    attributeName="stroke-dasharray"
                    values="0 8;4 4;0 8"
                    dur={`${1.5 + (i * 0.1)}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.3;1;0.3"
                    dur={`${2 + (i * 0.1)}s`}
                    repeatCount="indefinite"
                  />
                </path>
              );
            })}

            {/* Synaptic Connections */}
            {synapseConfigs.map((config, i) => {
              const angleRad = (config.angle * Math.PI) / 180;
              const x = 50 + Math.cos(angleRad) * config.radius;
              const y = 50 + Math.sin(angleRad) * config.radius;
              
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="0.8"
                  fill="url(#gradient3)"
                >
                  <animate
                    attributeName="r"
                    values="0.5;1.2;0.5"
                    dur={`${1 + (i * 0.05)}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.2;0.8;0.2"
                    dur={`${1.5 + (i * 0.05)}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              );
            })}

            {/* Gradients */}
            <defs>
              <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EC4899" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
              <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EC4899" />
                <stop offset="100%" stopColor="#A855F7" />
              </linearGradient>
              <radialGradient id="gradient3" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#EC4899" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </radialGradient>
            </defs>
          </svg>
        </div>

        {/* Loading Text */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent mb-2">
            KM ELECTRONICS
          </h1>
          <p className="text-pink-300 text-sm font-light tracking-widest">
            YOUR ULTIMATE PHONE PLUG
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-64 mx-auto mb-4">
          <div className="flex justify-between text-xs text-pink-300 mb-1">
            <span>ALMOST THERE</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-pink-600 to-purple-600 h-2 rounded-full transition-all duration-300 ease-out shadow-lg shadow-pink-500/30"
              style={{ width: `${progress}%` }}
            >
              <div className="w-2 h-2 bg-white rounded-full animate-pulse float-right mr-1 mt-1"></div>
            </div>
          </div>
        </div>

        {/* Status Messages */}
        <div className="text-pink-200 text-xs font-mono">
          {progress < 25 && "CONNECTING KM STOCKS..."}
          {progress >= 25 && progress < 50 && "INITIALIZING..."}
          {progress >= 50 && progress < 75 && "DONT LEAVE THIS PAGE..."}
          {progress >= 75 && progress < 100 && "SECURE YOUR EMAIL AND PASSWORD..."}
          {progress >= 100 && "REDIRECTING TO LOGIN..."}
        </div>

        {/* Binary Rain Effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {binaryPositions.map((pos, i) => (
            <div
              key={i}
              className="absolute text-pink-400/30 text-xs font-mono animate-binary-rain"
              style={{
                left: `${pos.left}%`,
                animationDelay: `${pos.delay}s`,
                animationDuration: `${pos.duration}s`
              }}
            >
              {i % 2 === 0 ? '1' : '0'}
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.7; }
          50% { transform: translateY(-20px) scale(1.1); opacity: 1; }
        }
        
        @keyframes binary-rain {
          0% { transform: translateY(-100px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        
        .animate-binary-rain {
          animation: binary-rain linear infinite;
        }
      `}</style>
    </div>
  );
}