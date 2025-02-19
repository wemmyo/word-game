import Link from "next/link";
import { Button } from "@/components/ui/button";
import AuthButton from "@/components/header-auth";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-100 to-purple-200 p-4">
      <h1 className="text-4xl font-bold text-purple-800 mb-8">
        Word Association Game
      </h1>
      <div className="space-y-4">
        <AuthButton />
      </div>
    </div>
  );
}
