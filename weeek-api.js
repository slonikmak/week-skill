import fs from 'fs/promises';
import { resolve } from 'path';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

export class WeeekClient {
    constructor(token = process.env.WEEEK_API_KEY, apiUrl = 'https://api.weeek.net/public/v1') {
        if (!token) {
            throw new Error('WEEEK_API_KEY is required');
        }
        this.token = token;
        this.apiUrl = apiUrl;
    }

    async request(method, path, body = null, params = null) {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        let url = `${this.apiUrl}${normalizedPath}`;
        
        if (params) {
            const validParams = {};
            Object.keys(params).forEach(key => {
                if (params[key] !== null && params[key] !== undefined) {
                    validParams[key] = params[key];
                }
            });
            const query = new URLSearchParams(validParams).toString();
            if (query) url += `?${query}`;
        }

        const fetchOptions = {
            method: method.toUpperCase(),
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        if (body) {
            fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`${response.status} ${response.statusText}: ${text}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    }

    // --- Projects & Boards ---

    async getProjects() {
        const data = await this.request('GET', 'tm/projects');
        return data.projects || [];
    }

    async getBoards(projectId = null) {
        if (projectId) {
            const data = await this.request('GET', 'tm/boards', null, { projectId });
            return data.boards || [];
        }

        // If no projectId, fetch all boards from all projects (heavy operation)
        const projects = await this.getProjects();
        const promises = projects.map(async p => {
            try {
                const boards = await this.getBoards(p.id);
                return boards.map(b => ({ ...b, projectName: p.name }));
            } catch {
                return [];
            }
        });
        const results = await Promise.all(promises);
        return results.flat();
    }

    async findBoard(query) {
        const boards = await this.getBoards();
        const queryLower = query.toLowerCase();
        const exact = boards.find(b => b.name.toLowerCase() === queryLower);
        if (exact) return [exact];
        return boards.filter(b => b.name.toLowerCase().includes(queryLower));
    }

    async getColumns(boardId) {
        const data = await this.request('GET', 'tm/board-columns', null, { boardId });
        return data.boardColumns || [];
    }

    // --- Tasks ---

    async getTasks(params = {}) {
        const data = await this.request('GET', 'tm/tasks', null, params);
        return data.tasks || [];
    }

    async getTask(taskId) {
        const res = await this.request('GET', `tm/tasks/${taskId}`);
        return res.task || res;
    }

    async createTask(data) {
        // data: { title, description, priority, boardId, boardColumnId, assignees, type }
        const payload = {
            type: 'action',
            ...data
        };
        const res = await this.request('POST', 'tm/tasks', payload);
        return res.task || res;
    }

    async updateTask(taskId, data) {
        const res = await this.request('PUT', `tm/tasks/${taskId}`, data);
        return res.task || res;
    }

    async moveTask(taskId, boardColumnId) {
        return await this.request('POST', `tm/tasks/${taskId}/board-column`, { boardColumnId });
    }

    // --- Users ---

    async getUsers() {
        const data = await this.request('GET', 'ws/members');
        return (data.members || []).map(u => ({
            id: u.id,
            name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
            email: u.email,
            raw: u
        }));
    }

    async findUser(query) {
        const users = await this.getUsers();
        const queryLower = query.toLowerCase();
        return users.find(u => 
            u.name.toLowerCase().includes(queryLower) || 
            u.email.toLowerCase().includes(queryLower)
        );
    }

    // --- Timer ---

    async startTimer(taskId) {
        return await this.request('POST', `tm/tasks/${taskId}/start-timer`);
    }

    async stopTimer(taskId) {
        return await this.request('POST', `tm/tasks/${taskId}/stop-timer`);
    }
}
