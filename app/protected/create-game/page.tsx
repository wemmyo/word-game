import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGameAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

export default function CreateGamePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-100 to-purple-200 p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-purple-800 mb-6">Create Game</h1>
        <form className="space-y-4">
          <div>
            <Label htmlFor="playerName">Your Name</Label>
            <Input
              id="playerName"
              name="playerName"
              placeholder="Enter your name"
              required
            />
          </div>

          <div>
            <Label htmlFor="timerDuration">Timer Duration (seconds)</Label>
            <Input
              type="number"
              name="timerDuration"
              defaultValue="15"
              className="mt-2"
            />
          </div>
          <SubmitButton
            pendingText="Creating Game..."
            formAction={createGameAction}
          >
            Create Game
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
