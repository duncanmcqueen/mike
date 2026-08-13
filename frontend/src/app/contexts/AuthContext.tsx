"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from "react";
import {
    getCurrentUser,
    signOut as localSignOut,
    updateEmail as updateLocalEmail,
    type AuthUser,
} from "@/app/lib/auth";

interface User {
    id: string;
    email: string;
    pendingEmail?: string | null;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    authLoading: boolean;
    signOut: () => Promise<void>;
    updateEmail: (email: string) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toUser(user: AuthUser): User {
    return {
        id: user.id,
        email: user.email || "",
        pendingEmail: user.pendingEmail ?? user.new_email ?? null,
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        const checkUser = async () => {
            const current = await getCurrentUser();
            setUser(current ? toUser(current) : null);
            setAuthLoading(false);
        };

        checkUser();

        window.addEventListener("mike-auth-change", checkUser);

        return () => {
            window.removeEventListener("mike-auth-change", checkUser);
        };
    }, []);

    const signOut = async () => {
        await localSignOut();
        setUser(null);
    };

    const updateEmail = async (email: string) => {
        const nextUser = toUser(await updateLocalEmail(email));
        setUser(nextUser);
        return nextUser;
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                authLoading,
                signOut,
                updateEmail,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
