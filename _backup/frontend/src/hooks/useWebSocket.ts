   import { useEffect } from "react";
   import { socket } from "@/lib/websocket";

   export function useWebSocket(event: string, handler: (data: any) => void) {
     useEffect(() => {
       const unsubscribe = socket.on(event, handler);
       return unsubscribe;
     }, [event, handler]);
   }