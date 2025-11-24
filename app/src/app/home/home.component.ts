import { Component, OnInit } from '@angular/core';
import { DemoStateService } from '../demostate.service';
import { ModelSearchService } from '../model-search/model-search.service';
import { Model } from '../types';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  pointScheduleCSV: File | null = null;
  pointListCSV: File | null = null;
  recent_model: Model | null = null;

  equipmentScheduleCSV: File | null = null;

  constructor(private demoStateService: DemoStateService, private modelSearchService: ModelSearchService) {}

  ngOnInit(): void {
    this.pointScheduleCSV = this.demoStateService.getPointscheduleCSV();
    this.pointListCSV = this.demoStateService.getPointlistCSV();
    this.equipmentScheduleCSV = this.demoStateService.getEquipmentScheduleCSV();
    this.mostRecentModel();
  }

  clearDemoState() {
    this.demoStateService.clearState();
    this.pointScheduleCSV = null;
    this.pointListCSV = null;
    this.equipmentScheduleCSV = null;
  }

  handleEquipmentScheduleCSVInput(e: Event) {
    this.equipmentScheduleCSV = (e?.target as HTMLInputElement)?.files?.[0] ?? null;
    this.demoStateService.setEquipmentScheduleCSV(this.equipmentScheduleCSV);
  }

  handlePointListCSVInput(e: Event) {
    this.pointListCSV = (e?.target as HTMLInputElement)?.files?.[0] ?? null;
    this.demoStateService.setPointlistCSV(this.pointListCSV);
  }

  handlePointScheduleCSVInput(e: Event) {
    this.pointScheduleCSV = (e?.target as HTMLInputElement)?.files?.[0] ?? null;
    this.demoStateService.setPointscheduleCSV(this.pointScheduleCSV);
  }

  mostRecentModel() {
    this.modelSearchService.getAllModels().subscribe({
      next: (models) => {
        console.log('Models:', models);
        // get model with largest id
        const maxId = Math.max(...models.map(model => model.id));
        this.recent_model = models.find(model => model.id === maxId) ?? null;
        console.log('Most recent model:', this.recent_model);
      },
      error: (error) => {
        console.error('Error fetching models:', error);
      }
    });
  }
}
