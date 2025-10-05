'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Suspense } from 'react';

function AvatarModel({ url }: { url: string }) {
    const { scene } = useGLTF(url);

    return (
        <primitive
            object={scene}
            scale={1.8}
            position={[0, -2.2, 0]}
        />
    );
}

export default function AvatarViewFullscreen({ avatarUrl }: { avatarUrl?: string }) {
    const defaultUrl = 'https://models.readyplayer.me/68e0fd9dd4242f6de7c7dc68.glb';
    const url = avatarUrl || defaultUrl;

    return (
        <div className="w-full h-full bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg overflow-hidden">
            <Canvas camera={{ position: [0, 0.3, 3.5], fov: 50 }}>
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 5, 5]} intensity={1} />
                <pointLight position={[-5, 5, -5]} intensity={0.5} />

                <Suspense fallback={null}>
                    <AvatarModel url={url} />
                </Suspense>

                <OrbitControls
                    enableZoom={true}
                    minDistance={2}
                    maxDistance={6}
                    enablePan={false}
                    target={[0, 0, 0]}
                />
            </Canvas>
        </div>
    );
}