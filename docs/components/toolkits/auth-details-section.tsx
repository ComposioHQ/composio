'use client';

import { Key } from 'lucide-react';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import type { AuthConfigDetail, AuthConfigField } from '@/types/toolkit';

interface AuthDetailsSectionProps {
  authConfigDetails: AuthConfigDetail[];
}

function formatTypeName(mode: string): string {
  const modeMap: Record<string, string> = {
    oauth2: 'OAuth2',
    oauth1: 'OAuth1',
    api_key: 'API Key',
    basic_auth: 'Basic Auth',
    bearer_token: 'Bearer Token',
    no_auth: 'No Auth',
  };
  return modeMap[mode.toLowerCase()] || mode;
}

function fieldsToTypeTable(fields: AuthConfigField[]): Record<string, {
  type: string;
  description?: string;
  default?: string;
  required?: boolean;
}> {
  const result: Record<string, {
    type: string;
    description?: string;
    default?: string;
    required?: boolean;
  }> = {};

  for (const field of fields) {
    result[field.name] = {
      type: field.type || 'string',
      description: field.description || undefined,
      default: field.default || undefined,
      required: field.required,
    };
  }

  return result;
}

function getAllFields(detail: AuthConfigDetail): AuthConfigField[] {
  if (!detail?.fields) return [];
  return [
    ...(detail.fields.auth_config_creation?.required || []),
    ...(detail.fields.auth_config_creation?.optional || []),
    ...(detail.fields.connected_account_initiation?.required || []),
    ...(detail.fields.connected_account_initiation?.optional || []),
  ];
}

export function AuthDetailsSection({ authConfigDetails }: AuthDetailsSectionProps) {
  if (!authConfigDetails || authConfigDetails.length === 0) {
    return null;
  }

  // Filter out auth modes with no fields in either section
  const validDetails = authConfigDetails.filter((detail) => {
    return detail && getAllFields(detail).length > 0;
  });

  if (validDetails.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-fd-foreground">
        <Key className="h-4 w-4" />
        Authentication Details
      </h2>
      <Accordions type="single">
        {validDetails.map((detail) => {
          const fields = getAllFields(detail);
          return (
            <Accordion key={detail.mode} title={formatTypeName(detail.mode)}>
              <TypeTable type={fieldsToTypeTable(fields)} />
            </Accordion>
          );
        })}
      </Accordions>
    </div>
  );
}
