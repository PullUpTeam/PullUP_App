import { useEffect, useRef, useState } from 'react';

export interface UseSocketProps {
  url?: string;
  enabled?: boolean;
  onMessage?: (data: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

export const useSocket = ({
  url = 'ws://localhost:3000/ws',
  enabled = true,
  onMessage,
  onOpen,
  onClose,
  onError,
}: UseSocketProps = {}): WebSocket | null => {
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const ws = new WebSocket(url);
        socketRef.current = ws;
        setSocket(ws);

        ws.onopen = () => {
            console.log('✅ Connected to WebSocket');
            onOpen?.();
        };

        ws.onclose = () => {
            console.warn('⚠️ WebSocket Disconnected');
            onClose?.();
        };

        ws.onerror = (err) => {
            console.error('❌ WebSocket Error:', err);
            onError?.(err);
        };

        ws.onmessage = (event) => {
            console.log('📨 Message from server:', event.data);
            
            if (onMessage) {
                try {
                    const data = JSON.parse(event.data);
                    onMessage(data);
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            }
        };

        return () => {
            ws.close();
        };
    }, [url, enabled, onMessage, onOpen, onClose, onError]);

    return socket;
};
