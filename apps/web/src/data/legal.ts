import type { LegalContent } from "@/components/legal/legal-page";

const LAST_UPDATED = "June 22, 2026";

export const PRIVACY_POLICY: LegalContent = {
	title: "Privacy Policy",
	lastUpdated: LAST_UPDATED,
	intro:
		"This Privacy Policy describes how Locnative collects, uses, and protects information when you use our website and location APIs. It is a draft and will be finalized following legal review.",
	sections: [
		{
			heading: "Information we collect",
			body: [
				"Account information you provide when you sign up, such as your name, email address, and organization.",
				"Usage data generated when you call our APIs, including request metadata, timestamps, and aggregate volume used for billing and abuse prevention.",
			],
		},
		{
			heading: "How we use information",
			body: [
				"To provide, maintain, and improve the service; to authenticate requests and meter usage; to communicate with you about your account; and to detect and prevent fraud or abuse.",
			],
		},
		{
			heading: "Address and location data",
			body: [
				"Addresses and coordinates submitted to our geocoding endpoints are processed to return results. We do not sell this data. Retention is limited to what is needed to operate and secure the service.",
			],
		},
		{
			heading: "Data sharing",
			body: [
				"We share data with infrastructure sub-processors (such as hosting and payment providers) strictly to operate the service, and where required by law.",
			],
		},
		{
			heading: "Your rights",
			body: [
				"Depending on your jurisdiction, you may have rights to access, correct, export, or delete your personal data. Contact us to exercise these rights.",
			],
		},
		{
			heading: "Contact",
			body: ["Questions about this policy can be sent to hello@locnative.com."],
		},
	],
};

export const TERMS_OF_SERVICE: LegalContent = {
	title: "Terms of Service",
	lastUpdated: LAST_UPDATED,
	intro:
		"These Terms of Service govern your access to and use of the Locnative website and APIs. They are a draft and will be finalized following legal review.",
	sections: [
		{
			heading: "Acceptance of terms",
			body: [
				"By creating an account or using the service, you agree to these terms. If you are using the service on behalf of an organization, you represent that you are authorized to do so.",
			],
		},
		{
			heading: "Accounts and API keys",
			body: [
				"You are responsible for safeguarding your API keys and for all activity that occurs under your account. Notify us promptly of any unauthorized use.",
			],
		},
		{
			heading: "Acceptable use",
			body: [
				"Your use of the service must comply with our Acceptable Use Policy. We may suspend access for violations or for activity that threatens the integrity of the service.",
			],
		},
		{
			heading: "Billing",
			body: [
				"Paid usage is metered and billed as described on our pricing page. Fees are based on actual usage beyond any free allotment.",
			],
		},
		{
			heading: "Availability and changes",
			body: [
				"We aim for high availability but the service is provided on an as-is basis without warranties unless separately agreed. We may modify or discontinue features with reasonable notice.",
			],
		},
		{
			heading: "Limitation of liability",
			body: [
				"To the extent permitted by law, Locnative is not liable for indirect or consequential damages arising from use of the service.",
			],
		},
	],
};

export const ACCEPTABLE_USE: LegalContent = {
	title: "Acceptable Use Policy",
	lastUpdated: LAST_UPDATED,
	intro:
		"This Acceptable Use Policy describes activities that are not permitted when using the Locnative service. It is a draft and will be finalized following legal review.",
	sections: [
		{
			heading: "Prohibited activities",
			body: [
				"Do not use the service to violate any law, infringe others' rights, or send unlawful, harassing, or harmful content.",
				"Do not attempt to gain unauthorized access to the service, other accounts, or our infrastructure, or to probe or test the vulnerability of any system without authorization.",
			],
		},
		{
			heading: "Fair use and rate limits",
			body: [
				"Do not circumvent rate limits, quotas, or billing. Automated traffic must stay within the limits associated with your plan.",
			],
		},
		{
			heading: "Data and privacy",
			body: [
				"Do not submit data you are not authorized to process, and do not use the service to build a competing address dataset by bulk-extracting results in violation of these terms.",
			],
		},
		{
			heading: "Enforcement",
			body: [
				"We may investigate violations and may suspend or terminate access for accounts that breach this policy.",
			],
		},
		{
			heading: "Reporting",
			body: ["Report suspected abuse to hello@locnative.com."],
		},
	],
};
