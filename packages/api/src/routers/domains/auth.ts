import { auth } from "@locnative/auth";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../procedures.ts";

const signUpInputSchema = z.object({
	email: z.email(),
	name: z.string().min(1),
	password: z.string().min(8),
});

export const authRouter = {
	healthCheck: publicProcedure.handler(() => ({
		message: "Auth server is healthy",
		status: "ok" as const,
	})),
	getSession: publicProcedure.handler(async ({ context }) => context.session),
	signUp: publicProcedure
		.input(signUpInputSchema)
		.handler(async ({ context, input }) => {
			return await auth.api.signUpEmail({
				headers: context.req.raw.headers,
				body: {
					email: input.email,
					name: input.name,
					password: input.password,
				},
			});
		}),
	privateData: protectedProcedure.handler(async ({ context }) => ({
		message: `Hello ${context.session.user.name ?? context.session.user.email}`,
		userId: context.session.user.id,
	})),
};
