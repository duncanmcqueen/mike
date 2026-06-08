"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, Check, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { deleteAccount } from "@/app/lib/mikeApi";

export default function AccountPage() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const { profile, updateDisplayName, updateOrganisation } = useUserProfile();
    const [displayName, setDisplayName] = useState("");
    const [isSavingName, setIsSavingName] = useState(false);
    const [saved, setSaved] = useState(false);
    const [organisation, setOrganisation] = useState("");
    const [isSavingOrg, setIsSavingOrg] = useState(false);
    const [orgSaved, setOrgSaved] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (profile?.displayName) {
            setDisplayName(profile.displayName);
        }
        if (profile?.organisation) {
            setOrganisation(profile.organisation);
        }
    }, [profile]);

    const handleLogout = async () => {
        await signOut();
        router.push("/");
    };

    const handleDeleteAccount = async () => {
        setIsDeleting(true);
        try {
            await deleteAccount();
            await signOut();
            router.push("/");
        } catch {
            setIsDeleting(false);
            setDeleteConfirm(false);
            alert("Failed to delete account. Please try again.");
        }
    };

    const handleSaveDisplayName = async () => {
        setIsSavingName(true);
        const success = await updateDisplayName(displayName.trim());
        setIsSavingName(false);

        if (success) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } else {
            alert("Failed to update display name. Please try again.");
        }
    };

    const handleSaveOrganisation = async () => {
        setIsSavingOrg(true);
        const success = await updateOrganisation(organisation.trim());
        setIsSavingOrg(false);

        if (success) {
            setOrgSaved(true);
            setTimeout(() => setOrgSaved(false), 2000);
        } else {
            alert("Failed to update organisation. Please try again.");
        }
    };

    if (!user) return null;

    return (
        <div className="space-y-8">
            {/* Profile Settings */}
            <section className="space-y-3">
                <h2 className="text-2xl font-medium font-serif text-gray-900">
                    Profile
                </h2>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-gray-600 block mb-2">
                                Display Name
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) =>
                                        setDisplayName(e.target.value)
                                    }
                                    placeholder="Enter your name"
                                    className="flex-1 bg-gray-50 shadow-none"
                                />
                                <Button
                                    onClick={handleSaveDisplayName}
                                    variant="outline"
                                    disabled={
                                        isSavingName ||
                                        !displayName.trim() ||
                                        saved
                                    }
                                    className="h-9 min-w-[74px] gap-1.5 bg-white px-2.5 text-xs text-gray-700 shadow-none hover:bg-gray-50"
                                >
                                    {isSavingName ? (
                                        "Saving..."
                                    ) : saved ? (
                                        <>
                                            <Check className="h-3.5 w-3.5" />
                                            Saved
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-3.5 w-3.5" />
                                            Save
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                        <div>
                            <label className="text-sm text-gray-600 block mb-2">
                                Organisation
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    type="text"
                                    value={organisation}
                                    onChange={(e) =>
                                        setOrganisation(e.target.value)
                                    }
                                    placeholder="Enter your organisation"
                                    className="flex-1 bg-gray-50 shadow-none"
                                />
                                <Button
                                    onClick={handleSaveOrganisation}
                                    variant="outline"
                                    disabled={
                                        isSavingOrg ||
                                        organisation.trim() ===
                                            (profile?.organisation ?? "") ||
                                        orgSaved
                                    }
                                    className="h-9 min-w-[74px] gap-1.5 bg-white px-2.5 text-xs text-gray-700 shadow-none hover:bg-gray-50"
                                >
                                    {isSavingOrg ? (
                                        "Saving..."
                                    ) : orgSaved ? (
                                        <>
                                            <Check className="h-3.5 w-3.5" />
                                            Saved
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-3.5 w-3.5" />
                                            Save
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                        <div>
                            <label className="text-sm text-gray-600 block mb-2">
                                Email
                            </label>
                            <Input
                                type="email"
                                value={user?.email ?? ""}
                                disabled
                                className="bg-gray-50 shadow-none disabled:text-gray-700 disabled:opacity-100"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Plan */}
            <section className="space-y-3">
                <h2 className="text-2xl font-medium font-serif text-gray-900">
                    Usage Plan
                </h2>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
                    <div>
                        <p className="text-base font-medium text-gray-500 capitalize">
                            {profile?.tier || "Free"}
                        </p>
                    </div>
                </div>
            </section>

            {/* Actions */}
            <section className="space-y-3">
                <h2 className="text-2xl font-medium font-serif text-gray-900">
                    Actions
                </h2>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
                    <Button
                        variant="outline"
                        onClick={handleLogout}
                        className="w-full shadow-none sm:w-auto"
                    >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                    </Button>
                </div>
            </section>

            {/* Danger Zone */}
            <section className="space-y-3">
                <h2 className="text-2xl font-medium font-serif text-red-600">
                    Danger Zone
                </h2>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-500 mb-4">
                        Permanently delete your account and all associated data.
                        This action cannot be undone.
                    </p>
                    {deleteConfirm ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3 max-w-sm">
                            <p className="text-sm font-medium text-red-700">
                                Are you sure? This will permanently delete your
                                account.
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setDeleteConfirm(false)}
                                    disabled={isDeleting}
                                    className="text-sm shadow-none"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleDeleteAccount}
                                    disabled={isDeleting}
                                    className="bg-red-600 text-sm text-white shadow-none hover:bg-red-700"
                                >
                                    {isDeleting
                                        ? "Deleting…"
                                        : "Delete Account"}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => setDeleteConfirm(true)}
                            className="w-full border-red-200 text-red-600 shadow-none hover:bg-red-50 hover:text-red-700 sm:w-auto"
                        >
                            Delete Account
                        </Button>
                    )}
                </div>
            </section>
        </div>
    );
}
