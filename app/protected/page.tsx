import FetchDataSteps from "@/components/tutorial/fetch-data-steps";
import { createClient } from "@/utils/supabase/server";
import { InfoIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-100 to-purple-200 p-4">
      <h1 className="text-4xl font-bold text-purple-800 mb-8">
        Word Association Game
      </h1>
      <div className="space-y-4">
        <Button asChild className="w-48">
          <Link href="/protected/create-game">Create Game</Link>
        </Button>
        <Button asChild className="w-48" variant="outline">
          <Link href="/protected/join-game">Join Game</Link>
        </Button>
      </div>
    </div>
  );
}
