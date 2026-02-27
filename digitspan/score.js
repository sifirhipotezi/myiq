import { NORMS } from './norms.js';

class Score {
  #FORWARD = 0;
  #BACKWARD = 0;
  #SEQUENCING = 0;
  #OVERALL = 0;

  constructor() {
    return new Proxy(this, this);
  }

  updateOverall() {
    this.#OVERALL = this.#FORWARD + this.#BACKWARD + this.#SEQUENCING;
  }

  getIQ(years, which) {
    const ageRange = NORMS['age-ranges'].find(([from, to]) => {
      return years >= from && years <= to;
    });
    const i = NORMS['age-ranges'].indexOf(ageRange);
    const mean = NORMS[which].means[i];
    const sd = NORMS[which].sds[i];
    const iq = 100 + ((this[which] - mean) / sd) * 15;
    return iq.toFixed(1);
  }

  get(target, prop) {
    return {
      FORWARD: this.#FORWARD,
      BACKWARD: this.#BACKWARD,
      SEQUENCING: this.#SEQUENCING,
      OVERALL: this.#OVERALL,
      getIQ: this.getIQ,
    }[prop];
  }

  set(target, prop, val) {
    if (prop === 'FORWARD') {
      this.#FORWARD = val;
    }
    if (prop === 'BACKWARD') {
      this.#BACKWARD = val;
    }
    if (prop === 'SEQUENCING') {
      this.#SEQUENCING = val;
    }
    this.updateOverall();
    return {
      FORWARD: this.#FORWARD || true,
      BACKWARD: this.#BACKWARD || true,
      SEQUENCING: this.#SEQUENCING || true,
    }[prop];
  }
}

export const SCORE = new Score();
