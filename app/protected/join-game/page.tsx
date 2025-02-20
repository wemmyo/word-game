// app/join-game/page.tsx

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinGameAction } from "../../actions";
import { SubmitButton } from "@/components/submit-button";

export default function JoinGame() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-100 to-purple-200 p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Join Game</h1>
        <form className="space-y-4">
          <div>
            <Label htmlFor="gameCode">Game Code</Label>
            <Input
              id="gameCode"
              name="gameCode"
              placeholder="Enter game code"
              required
            />
          </div>
          <div>
            <Label htmlFor="playerName">Your Name</Label>
            <Input
              id="playerName"
              name="playerName"
              placeholder="Enter your name"
              required
            />
          </div>

          <SubmitButton
            pendingText="Joining Game..."
            formAction={joinGameAction}
          >
            Join Game
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
