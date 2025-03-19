import React from "react";
import { useRoomState, useRoomAllUserStates } from "@agent8/gameserver";

interface GameUIProps {
  roomId: string;
  onExitGame: () => void;
}

const GameUI: React.FC<GameUIProps> = ({ roomId, onExitGame }) => {
  const roomState = useRoomState();
  const allPlayers = useRoomAllUserStates();
  
  // Sort players by score
  const sortedPlayers = [...(allPlayers || [])].sort((a, b) => 
    (b.score || 0) - (a.score || 0)
  );

  return (
    <div className="absolute top-0 left-0 w-full p-4 pointer-events-none">
      <div className="flex justify-between items-start">
        {/* Room info */}
        <div className="bg-gray-900 bg-opacity-75 p-2 rounded-md text-white pointer-events-auto">
          <p className="text-sm">Room: {roomId}</p>
          <p className="text-sm">Players: {allPlayers?.length || 0}/8</p>
          {roomState?.gameTime && (
            <p className="text-sm">Time: {Math.floor(roomState.gameTime / 1000)}s</p>
          )}
        </div>

        {/* Scoreboard */}
        <div className="bg-gray-900 bg-opacity-75 p-2 rounded-md text-white pointer-events-auto">
          <h3 className="text-sm font-bold mb-1">Scoreboard</h3>
          <div className="max-h-40 overflow-y-auto">
            {sortedPlayers.map((player, index) => (
              <div key={player.account} className="flex justify-between text-xs mb-1">
                <span>{index + 1}. {player.name || player.account}</span>
                <span className="ml-4">{player.score || 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Exit button */}
        <button
          onClick={onExitGame}
          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm pointer-events-auto"
        >
          Exit
        </button>
      </div>
    </div>
  );
};

export default GameUI;
