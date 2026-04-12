import { NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://fundersfirst.com',
  'https://www.fundersfirst.com',
];

export function corsHeaders(request) {
  const origin = request?.headers?.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.fundersfirst.com') ||
    process.env.NODE_ENV === 'development';

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function jsonResponse(data, status = 200, request) {
  return NextResponse.json(data, { status, headers: corsHeaders(request) });
}

export function optionsResponse(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
