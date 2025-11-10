// Integração com Google Maps Route Optimization API

import { RouteOptimizationClient } from "@googlemaps/routeoptimization";
import { Logger } from '@nestjs/common';

export class GoogleMapsRouteOptimization {
  private client: RouteOptimizationClient;
  private projectId: string;
  private logger = new Logger(GoogleMapsRouteOptimization.name);

  constructor(projectId: string) {
    this.client = new RouteOptimizationClient();
    this.projectId = projectId;
    this.logger.log(`GoogleMapsRouteOptimization inicializado para projeto: ${projectId}`);
  }

  async optimizeTours(model: any) {
    try {
      this.logger.debug('Iniciando otimização com Google Maps API');
      
      const request = {
        parent: `projects/${this.projectId}`,
        model: model,
        validateOnly: false
      } as any;

      this.logger.debug('Enviando requisição para Google Maps API:', JSON.stringify(request, null, 2));
      
      const response = await this.client.optimizeTours(request);
      
      this.logger.log('Otimização concluída com sucesso');
      this.logger.debug('Resposta da API:', JSON.stringify(response, null, 2));
      
      return response;
    } catch (error) {
      this.logger.error('Erro na otimização com Google Maps API:', error);
      throw error;
    }
  }

  // Método para validar se as credenciais estão configuradas
  isConfigured(): boolean {
    return !!this.projectId && !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }

  // Método para obter informações do projeto
  getProjectInfo() {
    return {
      projectId: this.projectId,
      hasCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS
    };
  }
}