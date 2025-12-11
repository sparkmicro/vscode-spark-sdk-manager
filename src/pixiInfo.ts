export interface PixiInfo {
    platform: string;
    environments_info?: {
        name: string;
        features?: string[];
        solve_group?: string;
        environment_size?: number;
        dependencies?: string[];
    }[];
}
