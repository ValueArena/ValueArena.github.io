'use client';
import { useEffect } from 'react';

export function EvaluationResults() {
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id') || '';
    if (/^[a-f0-9-]{36}$/.test(id)) location.replace(`/run/?slug=account/${id}`);
  }, []);
  return <p role="status">Opening evaluation results… <a href="/evaluate/">Your evaluations</a></p>;
}
